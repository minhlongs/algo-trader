export interface AlfonsiBookConfig {
  shapeScalingC: number;
  shapeExponentGamma: number;
  resilienceRateKappa: number;
}

export interface AlfonsiExecutionStep {
  tradeSizeDeltaX: number;
  elapsedTimeDeltaT: number;
}

export interface AlfonsiExecutionAssessment {
  currentBookDepthD: number;
  instantaneousSlippage: number;
  resilientDepthRecovery: number;
  cumulativeCost: number;
}
