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
import { atrAt, timeframeToMs } from './quality-metrics';
import { logger } from '../../shared/utils/logger';
import type {
  DataQualityGateOptions,
  DataQualityReport,
  DataQualityViolation,
  DataQualityWarning,
} from './data-quality-types';

export { timeframeToMs } from './quality-metrics';
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

    // OHLC invariants
    const maxOH = Math.max(c.open, c.close);
    const minOH = Math.min(c.open, c.close);
    if (c.high < maxOH || c.low > minOH) {
      violations.push({
        code: 'ohlc-invariant',
        index: i,
        message: `OHLC invariant violated at index ${i}: ` +
          `high=${c.high} low=${c.low} open=${c.open} close=${c.close}`,
      });
    }

    if (c.volume < 0) {
      violations.push({
        code: 'negative-volume',
        index: i,
        message: `Negative volume ${c.volume} at index ${i}`,
      });
    }

    if (c.volume === 0) {
      zeroStreak++;
      maxZeroStreak = Math.max(maxZeroStreak, zeroStreak);
    } else {
      zeroStreak = 0;
    }

    // Timestamp ordering + duplicates + gaps + price jumps (needs previous candle)
    if (i > 0) {
      const prev = candles[i - 1];
      const delta = c.timestamp.getTime() - prev.timestamp.getTime();

      if (delta === 0) {
        violations.push({
          code: 'duplicate-timestamp',
          index: i,
          message: `Duplicate timestamp ${c.timestamp.toISOString()} at index ${i}`,
        });
      } else if (delta < 0) {
        violations.push({
          code: 'gap',
          index: i,
          message: `Out-of-order timestamp at index ${i}: ` +
            `${c.timestamp.toISOString()} precedes ${prev.timestamp.toISOString()}`,
        });
      } else if (timeframeMs !== undefined && delta > 2 * timeframeMs) {
        const missing = Math.round(delta / timeframeMs) - 1;
        violations.push({
          code: 'gap',
          index: i,
          message: `Gap of ${missing} missing candle(s) before index ${i} ` +
            `(${prev.timestamp.toISOString()} -> ${c.timestamp.toISOString()})`,
        });
      }

      const atr = atrAt(candles, i, atrPeriod);
      if (atr !== undefined && atr > 0) {
        const jump = Math.abs(c.close - prev.close);
        if (jump > priceJumpAtrMultiple * atr) {
          violations.push({
            code: 'price-jump',
            index: i,
            message: `Price jump ${jump.toFixed(6)} exceeds ` +
              `${priceJumpAtrMultiple}x ATR (${(priceJumpAtrMultiple * atr).toFixed(6)}) at index ${i}`,
          });
        }
      }
    }
  }

  if (maxZeroStreak >= zeroVolumeStreakThreshold) {
    warnings.push({
      code: 'zero-volume-streak',
      message: `Zero-volume streak of ${maxZeroStreak} candles (threshold ${zeroVolumeStreakThreshold})`,
    });
  }

  // ── Coverage ────────────────────────────────────────────────────────────────
  let coveragePct = 1;
  if (timeframeMs !== undefined && candles.length >= 2) {
    const first = candles[0].timestamp.getTime();
    const last = candles[candles.length - 1].timestamp.getTime();
    const expected = Math.floor((last - first) / timeframeMs) + 1;
    coveragePct = expected > 0 ? Math.min(1, candles.length / expected) : 1;
  }

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
