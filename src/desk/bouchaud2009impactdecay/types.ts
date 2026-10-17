export interface Bouchaud2009ImpactDecayInput {
  readonly metaorderSharesQ: number;
  readonly dailyVolumeSharesV: number;
  readonly dailyVolatilityPriceUnitsSigma: number;
  readonly impactPrefactorY: number;
  readonly metaorderDurationSecT: number;
  readonly elapsedPostTradeSecTau: number;
  readonly decayExponentBeta: number;
  readonly permanentFloorFractionGamma: number;
}

export interface Bouchaud2009ImpactDecayOutput {
  readonly participationRatio: number;
  readonly peakSquareRootImpact: number;
  readonly permanentAsymptoticImpact: number;
  readonly residualImpactAtTau: number;
  readonly regime: 'PEAK_EXECUTION' | 'TRANSIENT_RELAXING' | 'ASYMPTOTIC_FLOOR';
}
