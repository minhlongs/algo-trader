/**
 * Data Quality Gate
 *
 * Pre-backtest validation of an OHLCV candle series. Detects the failure
 * modes that silently corrupt backtest results (ported concept from
 * upstream `backtest/validation.py`):
 *
 *   - gaps: missing candles (> 1 expected timeframe interval between rows)
 *   - duplicate timestamps
 *   - anomalous zero-volume streaks
 *   - price jumps larger than N x ATR (configurable)
 *   - OHLC invariant violations (high < max(o,c), low > min(o,c), volume < 0)
 *
 * Output is a `DataQualityReport` — callers fail fast when `passed=false`.
 */

import type { OhlcvCandle } from './ohlcv-store';
import { timeframeToMs } from './quality-metrics';
import { logger } from '../../shared/utils/logger';
import {
  checkCandleInvariants,
  checkCandleTransition,
  computeCandleCoveragePct,
} from './data-quality-checks';
import type {
  DataQualityGateOptions,
  DataQualityReport,
  DataQualityViolation,
  DataQualityWarning,
} from './data-quality-types';

export { timeframeToMs } from './quality-metrics';
export * from './data-quality-checks';
export type {
  DataQualityGateOptions,
  DataQualityReport,
  DataQualityViolation,
  DataQualityViolationCode,
  DataQualityWarning,
} from './data-quality-types';

// ── Gate ──────────────────────────────────────────────────────────────────────

/**
 * Run the data quality gate over a candle series.
 *
 * Pure function — no I/O, no mutation of the input. Deterministic for a
 * given input + options, which keeps tests reproducible.
 */
export function runDataQualityGate(
  candles: OhlcvCandle[],
  options: DataQualityGateOptions = {},
): DataQualityReport {
  const {
    priceJumpAtrMultiple = 10,
    atrPeriod = 14,
    zeroVolumeStreakThreshold = 20,
    minCoverage = 0.9,
  } = options;

  const violations: DataQualityViolation[] = [];
  const warnings: DataQualityWarning[] = [];

  if (candles.length === 0) {
    return { passed: false, violations: [], warnings: [], coveragePct: 0, candleCount: 0 };
  }

  // Resolve expected interval: explicit option wins, else infer from first candle.
  let timeframeMs = options.timeframeMs;
  if (timeframeMs === undefined) {
    timeframeMs = timeframeToMs(candles[0].timeframe);
    if (timeframeMs === undefined) {
      warnings.push({
        code: 'unknown-timeframe',
        message: `Unknown timeframe "${candles[0].timeframe}" — gap detection skipped`,
      });
    }
  }

  // ── Per-candle checks ───────────────────────────────────────────────────────
  let zeroStreak = 0;
  let maxZeroStreak = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    checkCandleInvariants(c, i, violations);

    if (c.volume === 0) {
      zeroStreak++;
      maxZeroStreak = Math.max(maxZeroStreak, zeroStreak);
    } else {
      zeroStreak = 0;
    }

    if (i > 0) {
      checkCandleTransition(
        candles,
        i,
        timeframeMs,
        atrPeriod,
        priceJumpAtrMultiple,
        violations,
      );
    }
  }

  if (maxZeroStreak >= zeroVolumeStreakThreshold) {
    warnings.push({
      code: 'zero-volume-streak',
      message: `Zero-volume streak of ${maxZeroStreak} candles (threshold ${zeroVolumeStreakThreshold})`,
    });
  }

  // ── Coverage ────────────────────────────────────────────────────────────────
  const coveragePct = computeCandleCoveragePct(candles, timeframeMs);

  if (coveragePct < minCoverage) {
    warnings.push({
      code: 'low-coverage',
      message: `Coverage ${(coveragePct * 100).toFixed(1)}% below threshold ${(minCoverage * 100).toFixed(1)}%`,
    });
  }

  const passed = violations.length === 0;

  if (!passed) {
    logger.warn(
      `[DataQualityGate] FAILED: ${violations.length} violation(s), ` +
      `${warnings.length} warning(s), coverage ${(coveragePct * 100).toFixed(1)}%`,
      'DataQualityGate',
    );
  }

  return { passed, violations, warnings, coveragePct, candleCount: candles.length };
}
