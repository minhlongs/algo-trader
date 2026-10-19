export interface DeepQueueLevelEvent {
  readonly levelIndex: number;
  readonly bidQueueDeltaShares: number;
  readonly askQueueDeltaShares: number;
  readonly depthNormalizationShares: number;
}

export interface ContKukanovStoikov2014DeepOfiInput {
  readonly levels: readonly DeepQueueLevelEvent[];
  readonly levelDecayRateKappa: number;
  readonly priceImpactSlopeBeta: number;
  readonly adverseQueueDepletionThreshold: number;
}

export interface ContKukanovStoikov2014DeepOfiOutput {
  readonly weightedDeepOfi: number;
  readonly topLevelOfi: number;
  readonly predictedMidPriceChangeTicks: number;
  readonly queueDepletionRatio: number;
  readonly adverseSweepDetected: boolean;
  readonly regime: 'BALANCED_DEEP_BOOK' | 'DIRECTIONAL_OFI_PRESSURE' | 'ADVERSE_MULTI_LEVEL_SWEEP';
}
