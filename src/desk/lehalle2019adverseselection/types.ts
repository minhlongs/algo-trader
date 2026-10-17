export interface Lehalle2019AdverseSelectionInput {
  readonly halfSpreadTicks: number;
  readonly cancelRatePerSecMu: number;
  readonly marketSweepRatePerSecLambda: number;
  readonly postDepletionMidMoveTicks: number;
  readonly queueHoldingCostTicks: number;
}

export interface Lehalle2019AdverseSelectionOutput {
  readonly sweepFillProbability: number;
  readonly expectedAdverseSelectionTicks: number;
  readonly netQueueValueTicks: number;
  readonly regime:
    | 'POSITIVE_QUEUE_VALUE'
    | 'NEUTRAL_MARGINAL'
    | 'TOXIC_CANCEL_IMMEDIATELY';
}
