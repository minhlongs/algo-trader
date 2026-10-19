/**
 * Type definitions for Cont & de Larrard (2013) Markovian LOB Queue Depletion Model.
 * SIAM Journal on Financial Mathematics, Vol. 4, No. 1, pp. 1-25.
 * Strictly < 150 LOC, zero `:any` types.
 */

export interface ContDeLarrardParameters {
  /** Rate of limit order arrivals at the best bid lambda_b (events/sec) */
  readonly lambdaBid: number;
  /** Rate of limit order arrivals at the best ask lambda_a (events/sec) */
  readonly lambdaAsk: number;
  /** Rate of market orders and cancellations at the best bid mu_b (events/sec) */
  readonly muBid: number;
  /** Rate of market orders and cancellations at the best ask mu_a (events/sec) */
  readonly muAsk: number;
  /** Average event size / order lot size in contracts */
  readonly unitOrderSize?: number;
}

export interface LobQueueState {
  /** Queue size at the best bid q_b (in contracts or lots) */
  readonly bidDepth: number;
  /** Queue size at the best ask q_a (in contracts or lots) */
  readonly askDepth: number;
}

export interface FirstPassageResult {
  readonly bidDepth: number;
  readonly askDepth: number;
  /** Probability that ask queue depletes first (price increases) p_up */
  readonly priceIncreaseProb: number;
  /** Probability that bid queue depletes first (price decreases) p_down */
  readonly priceDecreaseProb: number;
  /** Expected time until the first queue depletion tau (seconds) */
  readonly expectedDurationSec: number;
  /** Drift velocity of the bid queue (delta_b = mu_b - lambda_b) */
  readonly bidDrift: number;
  /** Drift velocity of the ask queue (delta_a = mu_a - lambda_a) */
  readonly askDrift: number;
  /** Asymmetry imbalance indicator */
  readonly queueImbalance: number;
}
