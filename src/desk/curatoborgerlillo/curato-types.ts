/**
 * Wave 230: Curato, Borger & Lillo (2017) Optimal Execution with Endogenous Queue Transitions Types.
 * Strictly < 200 LOC, zero :any.
 */

export interface QueueDynamicsConfig {
  readonly cancellationRateLambda: number;
  readonly arrivalRateMu: number;
  readonly queueDepletionDecayKappa: number;
  readonly halfSpreadCostS: number;
  readonly adverseSelectionAlpha: number;
}

export interface LimitOrderQueueState {
  readonly queuePositionAhead: number; // number of orders ahead
  readonly latencyPenaltyRisk: number;
}

export interface ExecutionDecision {
  readonly fillProbability: number;
  readonly expectedMakerCost: number;
  readonly expectedTakerCost: number;
  readonly recommendedAction: 'POST_PASSIVE_LIMIT' | 'SWEEP_AGGRESSIVE_MARKET';
}
