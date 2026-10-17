/**
 * Wave 258: Guéant (2015) Multi-Asset Cross-Impact Liquidation Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface Gueant2015MultiAssetConfig {
  readonly initialInventoryQ0: readonly number[];
  readonly covarianceSigma: readonly (readonly number[])[];
  readonly crossImpactH: readonly (readonly number[])[];
  readonly riskAversionGamma: number;
  readonly executionHorizonT: number;
  readonly steps?: number;
}

export interface Gueant2015MultiAssetResult {
  readonly optimalTradingSpeedNu0: readonly number[];
  readonly riccatiMatrixS: readonly (readonly number[])[];
  readonly inventoryTrajectory: readonly (readonly number[])[];
  readonly totalExecutionCost: number;
  readonly portfolioVariancePenalty: number;
  readonly crossImpactFriction: number;
}
