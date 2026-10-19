/**
 * Wave 265: Lehalle & Neuman (2019) Limit Order Book Queue-Reactive Liquidation Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface QueueState {
  readonly bidQueueDepth: number; // Q_t^b
  readonly askQueueDepth: number; // Q_t^a
  readonly midPrice: number;
  readonly tickSize: number;
}

export interface QueueReactiveLiquidationConfig {
  readonly initialInventory: number; // Q_0
  readonly queueDepletionAlpha: number; // rate of queue depletion alpha > 0
  readonly marketOrderPenaltyEta: number; // eta > 0
  readonly passiveFillIntensityLambda: number; // lambda > 0
  readonly adverseSelectionRiskGamma: number; // gamma > 0
}

export interface QueueReactiveDecision {
  readonly action: 'PASSIVE_POST' | 'AGGRESSIVE_CROSS';
  readonly postedOffsetTicks: number;
  readonly passiveFillProbability: number;
  readonly expectedExecutionCost: number;
}
