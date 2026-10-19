/**
 * Wave 287 — Cartea, Jaimungal & Kinzebulatov (2016): Algorithmic Trading with Learning
 * Types & Configuration Interfaces
 */

export interface Cartea2016LearningConfig {
  readonly priorDriftMeanMu0: number;
  readonly priorDriftVarianceV0: number;
  readonly assetVolatilitySigma: number;
  readonly observedPriceChangeDeltaS: number;
  readonly elapsedTimeSec: number;
  readonly remainingTimeSec: number;
  readonly currentInventoryQ: number;
  readonly temporaryImpactEta: number;
  readonly ambiguityAversionPhi: number;
}

export interface Cartea2016LearningResult {
  readonly posteriorDriftMean: number;
  readonly posteriorDriftVariance: number;
  readonly varianceReductionRatio: number;
  readonly learningAdjustedExecutionRate: number;
}
