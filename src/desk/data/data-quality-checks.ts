/**
 * Data Quality Checks
 *
 * Pure per-candle invariant, transition (gap/duplicate/price-jump), and
 * series coverage helpers extracted from data-quality-gate.ts.
 */

import type { OhlcvCandle } from './ohlcv-store';
import { atrAt } from './quality-metrics';
import type { DataQualityViolation } from './data-quality-types';

export function checkCandleInvariants(
  c: OhlcvCandle,
  i: number,
  violations: DataQualityViolation[],
): void {
  const maxOH = Math.max(c.open, c.close);
  const minOH = Math.min(c.open, c.close);
  if (c.high < maxOH || c.low > minOH) {
    violations.push({
      code: 'ohlc-invariant',
      index: i,
      message:
        `OHLC invariant violated at index ${i}: ` +
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
}

export function checkCandleTransition(
  candles: OhlcvCandle[],
  i: number,
  timeframeMs: number | undefined,
  atrPeriod: number,
  priceJumpAtrMultiple: number,
  violations: DataQualityViolation[],
): void {
  const c = candles[i];
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
      message:
        `Out-of-order timestamp at index ${i}: ` +
        `${c.timestamp.toISOString()} precedes ${prev.timestamp.toISOString()}`,
    });
  } else if (timeframeMs !== undefined && delta > 2 * timeframeMs) {
    const missing = Math.round(delta / timeframeMs) - 1;
    violations.push({
      code: 'gap',
      index: i,
      message:
        `Gap of ${missing} missing candle(s) before index ${i} ` +
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
        message:
          `Price jump ${jump.toFixed(6)} exceeds ` +
          `${priceJumpAtrMultiple}x ATR (${(priceJumpAtrMultiple * atr).toFixed(6)}) at index ${i}`,
      });
    }
  }
}

export function computeCandleCoveragePct(
  candles: OhlcvCandle[],
  timeframeMs: number | undefined,
): number {
  if (timeframeMs === undefined || candles.length < 2) return 1;
  const first = candles[0].timestamp.getTime();
  const last = candles[candles.length - 1].timestamp.getTime();
  const expected = Math.floor((last - first) / timeframeMs) + 1;
  return expected > 0 ? Math.min(1, candles.length / expected) : 1;
}
