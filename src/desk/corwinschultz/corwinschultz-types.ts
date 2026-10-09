/**
 * Corwin-Schultz (2012) High-Low Bid-Ask Spread Estimator Types
 * Reference: Corwin, S. A., & Schultz, P. (2012). A simple way to estimate bid-ask spreads from daily high and low prices.
 * The Journal of Finance, 67(2), 719-760.
 */

export interface CorwinSchultzBar {
  high: number;
  low: number;
  timestamp?: number;
}

export interface CorwinSchultzConfig {
  /** Window of two-day pairs to average over (default: entire series) */
  windowSize?: number;
  /** Whether to set negative spread estimates to zero (standard Corwin-Schultz convention, default: true) */
  clampNegativeToZero?: boolean;
}

export interface CorwinSchultzResult {
  /** Estimated relative bid-ask spread S in fractional terms (e.g. 0.015 = 1.5%) */
  spread: number;
  /** Estimated relative bid-ask spread S in basis points (e.g. 150 bps) */
  spreadBps: number;
  /** Estimated volatility sigma derived from the high-low range */
  volatility: number;
  /** Number of valid consecutive 2-bar pairs processed */
  pairCount: number;
  /** Raw unadjusted average alpha across pairs */
  rawAlpha: number;
  /** Raw unadjusted average beta across pairs */
  rawBeta: number;
  /** Raw unadjusted gamma across pairs */
  rawGamma: number;
}
