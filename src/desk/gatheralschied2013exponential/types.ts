export interface GatheralSchied2013ExponentialInput {
  readonly initialInventorySharesX0: number;
  readonly resilienceRateRhoPerSec: number;
  readonly horizonSecondsT: number;
  readonly bookDepthSharesPerTickK: number;
}

export interface GatheralSchied2013ExponentialOutput {
  readonly boundaryImpulseShares: number;
  readonly continuousTradingRateSharesPerSec: number;
  readonly continuousVolumeShareFraction: number;
  readonly expectedExecutionCostUsd: number;
  readonly regime: 'IMPULSE_DOMINATED' | 'BALANCED_BUCKET' | 'CONTINUOUS_RESILIENT';
}
