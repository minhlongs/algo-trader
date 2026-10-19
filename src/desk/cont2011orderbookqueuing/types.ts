export interface Cont2011OrderBookQueuingInput {
  readonly bidQueueSizeLots: number;
  readonly askQueueSizeLots: number;
  readonly limitArrivalRateLambda: number;
  readonly marketPlusCancelDepletionRateMu: number;
}

export interface Cont2011OrderBookQueuingOutput {
  readonly netDriftRatePerQueue: number;
  readonly queueImbalanceRatio: number;
  readonly upTickProbability: number;
  readonly expectedMidMoveSign: number;
  readonly regime: 'UPWARD_PRESSURE' | 'DOWNWARD_PRESSURE' | 'BALANCED_SYMMETRIC';
}
