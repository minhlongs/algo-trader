export interface Almgren2005DirectInput {
  readonly orderSharesX: number;
  readonly averageDailyVolumeV: number;
  readonly executionDurationFractionT: number;
  readonly dailyVolatilityFractionSigma: number;
  readonly permanentGamma?: number;
  readonly permanentAlpha?: number;
  readonly temporaryEta?: number;
  readonly temporaryBeta?: number;
}

export interface Almgren2005DirectOutput {
  readonly volumeFractionOrderSize: number;
  readonly participationRateRho: number;
  readonly permanentImpactBps: number;
  readonly temporaryCostComponentBps: number;
  readonly totalImplementationShortfallBps: number;
  readonly regime:
    | 'LOW_FOOTPRINT_PASSIVE'
    | 'CONCAVE_POWER_LAW_EXECUTION'
    | 'HIGH_PARTICIPATION_URGENCY_SURCHARGE';
}
