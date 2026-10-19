export interface BacryMuzy2014HawkesInput {
  readonly baselineIntensityPerSec: number;
  readonly selfExcitationAlpha: number;
  readonlycrossExcitationAlpha: number;
  readonly exponentialDecayBeta: number;
  readonly recentEventTimestampsSec: readonly number[];
  readonly currentTimeSec: number;
}

export interface BacryMuzy2014HawkesOutput {
  readonly branchingRatio: number;
  readonly stationaryMeanIntensity: number;
  readonly instantaneousIntensity: number;
  readonly endogenousFraction: number;
  readonly criticalityState: 'SUB_CRITICAL_STABLE' | 'NEAR_CRITICAL_CLUSTER' | 'SUPER_CRITICAL_EXPLOSIVE';
}
