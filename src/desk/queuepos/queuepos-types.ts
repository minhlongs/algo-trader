export interface LimitOrderPlacement {
  readonly orderId: string;
  readonly price: number;
  readonly quantity: number;
  readonly side: 'BUY' | 'SELL';
  readonly aheadVolumeInQueue: number;
}

export interface QueueDynamicsParameters {
  readonly tradeExecutionRatePerSec: number; // Nu: rate at which trades eat into the queue
  readonly cancellationRatePerSec: number;     // Delta: cancellation rate of orders ahead
  readonly adverseSelectionProbability: number;
}

export interface QueuePositionResult {
  readonly orderId: string;
  readonly initialAheadVolume: number;
  readonly estimatedFillTimeSec: number;
  readonly fillProbabilityWithinHorizon: number; // in [0, 1]
  readonly expectedExecutedShares: number;
  readonly adverseSelectionRiskScore: number;
}
