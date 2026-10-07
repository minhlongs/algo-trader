/**
 * LP LVR & Yield Sentinel Types
 *
 * Types for monitoring Loss-Versus-Rebalancing (LVR), tracking pool fee apr,
 * and recommending dynamic delta hedges against perpetuals.
 *
 * @module desk/amm/lp-lvr-yield-types
 */

export interface AmmPoolState {
  readonly poolAddress: string;
  readonly assetPrice: number;
  readonly poolTvlUsd: number;
  readonly feeTierBps: number;
  readonly dailyVolumeUsd: number;
  readonly rollingAnnualizedVol: number;
}

export interface LpPositionSnapshot {
  readonly positionId: string;
  readonly poolAddress: string;
  readonly liquidityUnits: number;
  readonly positionValueUsd: number;
  readonly lowerTickPrice: number;
  readonly upperTickPrice: number;
}

export interface LpLvrMetrics {
  readonly poolAddress: string;
  readonly annualizedLvrPct: number;
  readonly feeAprPct: number;
  readonly netLpYieldPct: number;
  readonly isYieldProfitable: boolean;
  readonly recommendedDeltaHedgeUnits: number;
  readonly estimatedDailyLvrDragUsd: number;
}
