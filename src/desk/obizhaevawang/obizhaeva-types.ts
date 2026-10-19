export interface ObizhaevaTransientConfig {
  instantaneousImpactLambda: number;
  resilienceRateRho: number;
}

export interface ObizhaevaExecutionRequest {
  totalSharesX0: number;
  timeHorizonSecT: number;
}

export interface ObizhaevaOptimalSchedule {
  initialBlockJumpDeltaX0: number;
  terminalBlockJumpDeltaXT: number;
  continuousTradingRateV: number;
  totalContinuousShares: number;
  minimumExpectedCost: number;
}
