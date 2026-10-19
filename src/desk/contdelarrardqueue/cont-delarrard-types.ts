/**
 * Wave 218: Cont & de Larrard (2013) Markovian LOB Queueing Types.
 *
 * Implements Markov chain queue dynamics at the best bid and ask.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface ContDeLarrardConfig {
  limitOrderArrivalRate: number;      // lambda (orders / sec)
  marketOrderArrivalRate: number;     // mu (orders / sec)
  cancellationRate: number;           // theta (cancellations / sec)
  tickSize: number;                   // tick size in $ (e.g. 0.01)
}

export interface LobQueueState {
  bidQueueDepth: number;              // q^b (contracts/shares)
  askQueueDepth: number;              // q^a (contracts/shares)
  midPrice: number;                   // Current mid price
}

export interface PriceMoveProbability {
  probUpMove: number;                 // P(ask depleted before bid)
  probDownMove: number;               // P(bid depleted before ask)
  expectedDepletionTimeSec: number;   // E[tau]
  orderBookImbalance: number;         // (q^b - q^a) / (q^b + q^a)
  predictedNextMid: number;           // Expected mid price after move
}

export interface QueueEvolutionStep {
  step: number;
  timeSec: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
}
