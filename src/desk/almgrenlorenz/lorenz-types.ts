/**
 * Wave 237: Almgren & Lorenz (2007) Bayesian Adaptive Execution
 * Strictly < 150 LOC, zero :any.
 */

export interface BayesianDriftConfig {
  readonly initialPriorMeanAlpha0: number;
  readonly priorVarianceSigma0Sq: number;
  readonly priceVolatilitySigma: number;
  readonly temporaryImpactEta: number;
}

export interface PriceObservationUpdate {
  readonly priceChangeDeltaS: number;
  readonly timeElapsedDeltaT: number;
}

export interface BayesianStateAssessment {
  readonly posteriorMeanAlpha: number;
  readonly posteriorVarianceSigmaSq: number;
  readonly kalmanGainK: number;
  readonly recommendedTradingRateV: number;
}
