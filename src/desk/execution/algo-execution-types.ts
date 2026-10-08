/**
 * Algorithmic Execution & Optimal Scheduling Types
 * TWAP/VWAP volume profiles, Almgren-Chriss liquidation trajectories, and Iceberg orders.
 *
 * @module desk/execution/algo-execution-types
 */

export interface ExecutionScheduleSlice {
  sliceIndex: number;
  scheduledTimeMs: number;
  targetQuantity: number;
  targetCumulativeQuantity: number;
  participationRate: number; // e.g. 0.05 for 5% POV
}

export interface VolumeProfileBucket {
  bucketIndex: number;
  startMinuteOfDay: number;
  expectedVolumeShare: number; // 0 to 1, summing to 1.0 across the trading day
}

export interface AlmgrenChrissParameters {
  totalQuantity: number; // X_0
  totalIntervals: number; // N
  intervalLengthSec: number; // tau
  assetVolatilitySigma: number; // sigma
  riskAversionLambda: number; // lambda
  temporaryImpactEta: number; // eta
  permanentImpactGamma: number; // gamma
}

export interface AlmgrenChrissTrajectoryPoint {
  step: number;
  holdingQuantity: number; // x_k
  tradeQuantity: number; // n_k = x_{k-1} - x_k
  expectedPriceImpact: number;
}

export interface IcebergOrderConfig {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  displayQuantity: number;
  displayVariancePct: number; // e.g. 0.1 for +/- 10% randomization
  limitPrice: number;
  discretionOffset: number; // price improvement willingness (e.g. 1 tick)
}

export interface IcebergChildSlice {
  childId: string;
  parentOrderId: string;
  side: 'BUY' | 'SELL';
  displayQuantity: number;
  limitPrice: number;
  discretionPrice: number;
  remainingParentReserve: number;
  isFinalSlice: boolean;
}
