/**
 * Uniswap V3 DEX Adapter — read-only pool data client.
 *
 * Fetches on-chain pool state (sqrtPriceX96, liquidity, tick) and
 * computes token prices for Uniswap V3 pools on Ethereum.
 *
 * Uses ethers.js for chain interaction.
 *
 * Required env vars (optional — falls back to public RPC):
 *   ETH_RPC_URL — JSON-RPC endpoint for Ethereum mainnet
 *
 * Gated chain IDs:
 *   1  — Ethereum mainnet
 *   137 — Polygon (for Polymarket-related pools)
 */

import { ethers } from 'ethers';
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';
import type { DexAdapterConfig, DexPoolInfo, DexTokenPrice, DexPoolReserves } from './dex-types';

// ── Constants ───────────────────────────────────────────────────────────────────

/** Uniswap V3 Factory (Ethereum mainnet) */
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

/** Uniswap V3 Quoter (Ethereum mainnet) */
const UNISWAP_V3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

/** Fee tiers in basis points */
const FEE_TIERS = [100, 500, 3000, 10000] as const;

const RATE_PER_SEC = 10; // Conservative for public RPC

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'function feeAmountTickSpacing(uint24 fee) view returns (int24 spacing)',
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];

const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const DEFAULT_RPC = 'https://eth.llamarpc.com';

// ── Injectable provider interface ──────────────────────────────────────────────

/** Minimal interface for an ethers provider — enables test injection */
export interface EthersProviderLike {
  getBlockNumber(): Promise<number>;
  call(tx: ethers.TransactionRequest): Promise<string>;
}

/** Creates a real ethers JsonRpcProvider from env or config */
export function createDefaultProvider(config?: DexAdapterConfig): ethers.JsonRpcProvider {
  const rpcUrl = config?.rpcUrl ?? process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  return new ethers.JsonRpcProvider(rpcUrl, config?.chainId ?? 1, {
    staticNetwork: true,
  });
}

// ── Price math ──────────────────────────────────────────────────────────────────

const Q96 = 0x1000000000000000000000000n; // 2^96

/**
 * Convert sqrtPriceX96 to a decimal price (token1/token0).
 * Returns 0 on invalid input.
 */
export function sqrtPriceX96ToPrice(sqrtPriceX96: string, decimals0 = 18, decimals1 = 18): number {
  try {
    const sqrt = BigInt(sqrtPriceX96);
    if (sqrt <= 0n) return 0;
    const priceX96 = (sqrt * sqrt) / Q96;
    const shift = 10 ** (decimals0 - decimals1);
    return Number(priceX96) / 2 ** 96 * shift;
  } catch {
    return 0;
  }
}

/**
 * Determine the fee tier enum (basis points) from fee amount.
 */
export function feeToPercent(feeBps: number): number {
  return feeBps / 10_000;
}

// ── Adapter ─────────────────────────────────────────────────────────────────────

export class UniswapV3Adapter {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly factory: ethers.Contract;
  private readonly quoter: ethers.Contract;

  constructor(provider?: ethers.JsonRpcProvider) {
    this.provider = provider ?? createDefaultProvider();
    this.factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, this.provider);
    this.quoter = new ethers.Contract(UNISWAP_V3_QUOTER, QUOTER_ABI, this.provider);

    rateLimiterRegistry.getOrCreate('uniswap-v3', RATE_PER_SEC);
  }

  // ── Public pool helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the Uniswap V3 pool address for a token pair + fee tier.
   */
  async getPoolAddress(tokenA: string, tokenB: string, fee: number): Promise<string> {
    const addr: string = await this.factory.getPool(tokenA, tokenB, fee);
    return addr;
  }

  /**
   * Fetch full on-chain pool state for a given pool address.
   */
  async getPoolInfo(poolAddress: string): Promise<DexPoolInfo> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);

    const [slot0Data, liquidity, token0, token1, feeRaw] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
      pool.token0(),
      pool.token1(),
      pool.fee(),
    ]);

    const slot0 = slot0Data as { sqrtPriceX96: bigint; tick: number };
    const fee = Number(feeRaw);

    return {
      address: poolAddress,
      token0,
      token1,
      fee,
      tick: slot0.tick,
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
    };
  }

  /**
   * Fetch current pool reserves (price + liquidity snapshot).
   */
  async getPoolReserves(poolAddress: string): Promise<DexPoolReserves> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);

    const [slot0Data, liquidity] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
    ]);

    const slot0 = slot0Data as { sqrtPriceX96: bigint; tick: number };

    return {
      poolAddress,
      reserve0: '0', // Not stored as reserves in V3 — uses sqrtPriceX96 + liquidity
      reserve1: '0',
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      tick: slot0.tick,
      timestamp: Date.now(),
    };
  }

  /**
   * Quote an exact input swap amount — returns expected output.
   * Can be used to derive effective price.
   */
  async quoteExactInput(
    tokenIn: string,
    tokenOut: string,
    fee: number,
    amountIn: string,
  ): Promise<{ amountOut: bigint; price: number }> {
    const result = (await this.quoter.quoteExactInputSingle(
      tokenIn,
      tokenOut,
      fee,
      amountIn,
      0,
    )) as unknown as { 0: bigint; amountOut: bigint };

    const amountOut = result[0] as bigint;
    const amountInBig = BigInt(amountIn);
    const price = amountInBig > 0n
      ? Number(amountOut) / Number(amountInBig)
      : 0;

    return { amountOut, price };
  }

  /**
   * Get the current token price from a pool by reading sqrtPriceX96.
   * Token ordering matters: price = token1/token0 from the pool's perspective.
   */
  async getTokenPrice(
    tokenA: string,
    tokenB: string,
    fee: number,
    decimals0 = 18,
    decimals1 = 18,
  ): Promise<DexTokenPrice> {
    const poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);

    const poolInfo = await this.getPoolInfo(poolAddress);
    const price = sqrtPriceX96ToPrice(poolInfo.sqrtPriceX96, decimals0, decimals1);

    return {
      tokenIn: tokenA,
      tokenOut: tokenB,
      poolAddress,
      price,
      sqrtPriceX96: poolInfo.sqrtPriceX96,
      timestamp: Date.now(),
    };
  }

  /**
   * Discover all fee-tier pool addresses for a token pair.
   */
  async discoverPools(tokenA: string, tokenB: string): Promise<{ fee: number; address: string }[]> {
    const results: { fee: number; address: string }[] = [];

    for (const fee of FEE_TIERS) {
      try {
        const addr = await this.getPoolAddress(tokenA, tokenB, fee);
        if (addr && addr !== ethers.ZeroAddress) {
          results.push({ fee, address: addr });
        }
      } catch {
        // Pool may not exist for this fee tier — skip
      }
    }

    return results;
  }

  /** Return adapter name for logging/identification */
  getName(): string {
    return 'uniswap-v3';
  }
}
