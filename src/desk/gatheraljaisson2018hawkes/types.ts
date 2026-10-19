export interface GatheralJaisson2018HawkesInput {
  readonly branchingRatioNormN: number;
  readonly kernelTailExponentOnePlusAlpha: number;
  readonly baselineIntensityMu: number;
  readonly criticalBranchingCutoff: number;
}

export interface GatheralJaisson2018HawkesOutput {
  readonly alphaExponent: number;
  readonly impliedRoughHurstH: number;
  readonly stationaryExpectedIntensity: number;
  readonly varianceAmplificationFactor: number;
  readonly supercriticalFlashCrashRisk: boolean;
  readonly regime: 'SUBCRITICAL_ERGODIC_HAWKES' | 'NEAR_CRITICAL_ROUGH_SCALING' | 'SUPERCRITICAL_ENDogeneity_TRIP';
}
