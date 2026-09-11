/**
 * Uniswap V3 DEX Adapter — read-only pool data client.
 * Fetches on-chain pool state and computes token prices for Uniswap V3 on Ethereum.
 */

import { ethers } from 'ethers';
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';
import type { DexPoolInfo, DexTokenPrice, DexPoolReserves } from './dex-types';
import {
  UNISWAP_V3_FACTORY,
  UNISWAP_V3_QUOTER,
  FEE_TIERS,
  RATE_PER_SEC,
  FACTORY_ABI,
  POOL_ABI,
  QUOTER_ABI,
} from './uniswap-v3-constants';
import { sqrtPriceX96ToPrice } from './uniswap-v3-math';
import { createDefaultProvider } from './uniswap-v3-provider';

export * from './uniswap-v3-constants';
export * from './uniswap-v3-math';
export * from './uniswap-v3-provider';

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

  /** Resolve the Uniswap V3 pool address for a token pair + fee tier. */
  async getPoolAddress(tokenA: string, tokenB: string, fee: number): Promise<string> {
    const addr: string = await this.factory.getPool(tokenA, tokenB, fee);
    return addr;
  }

  /** Fetch full on-chain pool state for a given pool address. */
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
    return {
      address: poolAddress,
      token0,
      token1,
      fee: Number(feeRaw),
      tick: slot0.tick,
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
    };
  }

  /** Fetch current pool reserves (price + liquidity snapshot). */
  async getPoolReserves(poolAddress: string): Promise<DexPoolReserves> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const [slot0Data, liquidity] = await Promise.all([pool.slot0(), pool.liquidity()]);
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

  /** Quote an exact input swap amount — returns expected output. */
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
    const price = amountInBig > 0n ? Number(amountOut) / Number(amountInBig) : 0;
    return { amountOut, price };
  }

  /** Get current token price from pool by reading sqrtPriceX96. */
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

  /** Discover all fee-tier pool addresses for a token pair. */
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
