/**
 * Lead-Lag Alpha Predictor Types
 *
 * Mathematical and algorithmic contracts for asynchronous cross-exchange
 * lead-lag alpha discovery and Hawkes jump intensity modeling.
 *
 * @module desk/signal/lead-lag-alpha-types
 */

export interface PriceTick {
  readonly venue: string;
  readonly symbol: string;
  readonly price: number;
  readonly timestampMs: number;
}

export interface LeadLagPredictorConfig {
  readonly halflifeMs: number;
  readonly minObservations: number;
  readonly decayBeta: number;
  readonly minCorrelationThreshold: number;
}

export interface LeadLagAlphaSignal {
  readonly leadVenue: string;
  readonly lagVenue: string;
  readonly symbol: string;
  readonly estimatedLagMs: number;
  readonly crossCorrelation: number;
  readonly expectedPriceDriftBps: number;
  readonly jumpIntensity: number;
  readonly confidence: number;
  readonly timestampMs: number;
}
