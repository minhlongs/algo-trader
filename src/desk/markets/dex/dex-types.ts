/**
 * Shared types for DEX market data adapters (Uniswap V3 + future DEX adapters).
 * All adapters produce these normalized shapes; strategy code depends only on this module.
 */

/** Normalized DEX pool info */
export interface DexPoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  tick: number;
  sqrtPriceX96: string;
  liquidity: string;
}

/** Normalized token price from a DEX pool */
export interface DexTokenPrice {
  tokenIn: string;
  tokenOut: string;
  poolAddress: string;
  price: number;
  sqrtPriceX96: string;
  timestamp: number;
}

/** Normalized pool reserve snapshot */
export interface DexPoolReserves {
  poolAddress: string;
  reserve0: string;
  reserve1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: number;
  timestamp: number;
}

/** DEX adapter config */
export interface DexAdapterConfig {
  /** JSON-RPC URL for the chain */
  rpcUrl?: string;
  /** Default chain ID (default: 1 = Ethereum mainnet) */
  chainId?: number;
}
