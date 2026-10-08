/**
 * Concentrated Liquidity & AMM Mathematics Types
 * Tick indices, Q64.96 fixed-point sqrt prices, and Loss-Versus-Rebalancing (LVR) metrics.
 *
 * @module desk/concentrated/concentrated-types
 */

export interface Tick {
  index: number;
  liquidityGross: bigint;
  liquidityNet: bigint; // Signed net change when crossing left-to-right
  sqrtPriceX96: bigint;
  initialized: boolean;
}

export interface ConcentratedPoolState {
  symbol: string;
  sqrtPriceX96: bigint;
  currentTick: number;
  liquidity: bigint;
  feeBps: number;
  tickSpacing: number;
}

export interface SwapStepResult {
  sqrtPriceNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
}

export interface ConcentratedSwapResult {
  amountIn: bigint;
  amountOut: bigint;
  finalSqrtPriceX96: bigint;
  finalTick: number;
  finalLiquidity: bigint;
  totalFeeAmount: bigint;
  ticksCrossed: number;
}

export interface LvrHedgeParameters {
  poolLiquidity: number; // L in active tick range
  currentPrice: number; // P
  assetVolatilitySigma: number; // sigma
  poolValueUsd: number; // V_pool
  feeRateBps: number; // gamma
}

export interface LvrMetrics {
  instantaneousLvrRateUsdPerDay: number;
  optimalHedgeDelta: number; // units of asset to short to hedge LP inventory delta
  breakEvenDailyVolumeUsd: number; // volume needed so fees >= LVR
  isLpNetPositive: boolean;
  adverseSelectionBps: number;
}
