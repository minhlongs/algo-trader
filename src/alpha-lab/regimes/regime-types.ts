/**
 * Market Regime Types
 *
 * Deterministic, causal regime classification. At timestamp T the
 * classifier may only use data available at or before T.
 *
 * Regime taxonomy (initial):
 * - TREND_UP: directional up move with conviction
 * - TREND_DOWN: directional down move with conviction
 * - RANGE: no clear directional bias, low trend strength
 * - HIGH_VOLATILITY: realized volatility elevation vs recent baseline
 * - LOW_VOLATILITY: sustained compression vs baseline
 * - SHOCK: abrupt expansion (gap / large range / volume spike)
 * - UNKNOWN: insufficient data or indeterminate
 */

export type MarketRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'SHOCK'
  | 'UNKNOWN';

export interface CandleLike {
  timestamp: string; // ISO-8601 UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RegimeFeatures {
  /** Annualized realized vol over lookback (may be NaN if insufficient data). */
  realizedVol: number | null;
  /** Average True Range over lookback. */
  atr: number | null;
  /** Slope of close prices over lookback (linear regression). */
  closeSlope: number | null;
  /** ADX-style trend strength in [0, 100]. null if lookback too short. */
  trendStrength: number | null;
  /** Std dev of returns over lookback (not annualized). */
  returnDispersion: number | null;
  /** Volume z-score vs lookback history. */
  volumeAbnormality: number | null;
}

export interface RegimeSnapshot {
  /** Causal timestamp — no future data in features. */
  timestamp: string;
  market: string;
  timeframe: string;
  features: RegimeFeatures;
  regime: MarketRegime;
  /** Human-readable explanation for the result. */
  explanation: string;
}

export interface RegimeClassifierOptions {
  market: string;
  timeframe: string;
  lookback: number; // number of candles used for feature computation
}

/**
 * Rules explaining feature thresholds for each regime.
 *
 * Each rule is a predicate over RegimeFeatures + lookback metadata.
 * Order matters: first matching rule wins within its branch.
 */
export interface RegimeRule {
  readonly regime: MarketRegime;
  readonly description: string;
  readonly matches: (f: RegimeFeatures) => boolean;
}