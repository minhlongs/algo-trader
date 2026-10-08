export interface ContStoikovRates {
  readonly orderArrivalRate: number; // lambda: market limit order arrival
  readonly orderCancelRate: number;  // theta: cancellation rate per queue slot
  readonly marketExecutionRate: number; // mu: market order arrival rate (depletion)
}

export interface ContStoikovQueueState {
  readonly queuePosition: number; // Order position in book (1 = best)
  readonly queueDepth: number;    // Total depth at this price level
}

export interface ContStoikovFillProbability {
  readonly fillProbability: number;         // Probability of being executed before price moves
  readonly expectedTimeSec: number;          // Expected time to execution or level exhaustion
  readonly queuePosition: number;
  readonly queueDepth: number;
}
