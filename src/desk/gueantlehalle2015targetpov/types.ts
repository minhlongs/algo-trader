export interface GueantLehalle2015TargetPovInput {
  readonly remainingSharesQ: number;
  readonly expectedMarketVolumeRateV: number;
  readonly remainingHorizonSeconds: number;
  readonly impactExponentPhi: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly maxPovCapRatio: number;
}

export interface GueantLehalle2015TargetPovOutput {
  readonly characteristicRateLambda: number;
  readonly rawOptimalPovRatio: number;
  readonly cappedTargetPovRatio: number;
  readonly childOrderRateSharesPerSec: number;
  readonly povCapActive: boolean;
  readonly regime: 'PASSIVE_POV_TRACKING' | 'ASYMPTOTIC_POWER_LAW_POV' | 'POV_CAP_THROTTLED';
}
