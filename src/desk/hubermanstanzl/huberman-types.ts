/**
 * Wave 238: Huberman & Stanzl (2004) Price Manipulation and Quasi-Arbitrage
 * Strictly < 150 LOC, zero :any.
 */

export interface QuasiArbitrageConfig {
  readonly permanentImpactLambda: number;
  readonly temporaryImpactEta: number;
}

export interface RoundTripStrategy {
  readonly roundTripVolumes: readonly number[];
  readonly timeStepDeltaT: number;
}

export interface QuasiArbitrageAssessment {
  readonly totalExpectedRevenue: number;
  readonly isQuasiArbitrageFree: boolean;
  readonly permanentPriceDrift: number;
  readonly temporaryImpactDissipationCost: number;
}
