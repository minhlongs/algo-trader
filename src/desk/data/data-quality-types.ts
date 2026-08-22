/**
 * Data Quality Types
 *
 * Shared types for the data quality gate: violation/warning records,
 * the report shape returned to callers, and gate options.
 */

export type DataQualityViolationCode =
  | 'gap'
  | 'duplicate-timestamp'
  | 'ohlc-invariant'
  | 'negative-volume'
  | 'price-jump';

export interface DataQualityViolation {
  code: DataQualityViolationCode;
  index: number;
  message: string;
}

export interface DataQualityWarning {
  code: 'zero-volume-streak' | 'low-coverage' | 'unknown-timeframe';
  message: string;
}

export interface DataQualityReport {
  passed: boolean;
  violations: DataQualityViolation[];
  warnings: DataQualityWarning[];
  /** Fraction of expected candles actually present, 0..1 */
  coveragePct: number;
  candleCount: number;
}

export interface DataQualityGateOptions {
  /** Expected interval between candles in ms. Required for gap detection. */
  timeframeMs?: number;
  /** Price jump threshold as multiple of ATR (default 10). */
  priceJumpAtrMultiple?: number;
  /** ATR lookback window in candles (default 14). */
  atrPeriod?: number;
  /** Consecutive zero-volume candles that trigger a warning (default 20). */
  zeroVolumeStreakThreshold?: number;
  /** Coverage below this fraction triggers a low-coverage warning (default 0.9). */
  minCoverage?: number;
}
