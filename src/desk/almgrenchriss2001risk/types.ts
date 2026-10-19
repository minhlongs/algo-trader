export interface AlmgrenChriss2001RiskInput {
  readonly initialSharesX0: number;
  readonly volatilityPerSecSigma: number;
  readonly temporaryImpactEta: number;
  readonly permanentImpactGamma: number;
  readonly riskAversionLambda: number;
  readonly horizonSecT: number;
}

export interface AlmgrenChriss2001RiskOutput {
  readonly urgencyRateKappa: number;
  readonly halfLifeSec: number;
  readonly expectedPermanentCostUsd: number;
  readonly expectedTemporaryCostUsd: number;
  readonly expectedShortfallUsd: number;
  readonly utilityAdjustedCostUsd: number;
  readonly regime: 'RISK_NEUTRAL_TWAP' | 'MODERATE_FRONT_LOAD' | 'AGGRESSIVE_URGENT';
}
