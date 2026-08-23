/**
 * Quality Metrics
 *
 * Small numeric helpers shared by the data quality gate: timeframe interval
 * resolution and Average True Range (ATR) computation over a candle series.
 */

import type { OhlcvCandle } from './ohlcv-store';

// ── Timeframe intervals ───────────────────────────────────────────────────────

const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000,
  '8h': 28_800_000, '12h': 43_200_000,
  '1d': 86_400_000, '3d': 259_200_000, '1w': 604_800_000,
};

/** Resolve the expected interval in ms for a timeframe string, or undefined. */
export function timeframeToMs(timeframe: string): number | undefined {
  return TIMEFRAME_MS[timeframe];
}

// ── ATR ───────────────────────────────────────────────────────────────────────

/**
 * True Range for candle i given the previous close. Falls back to the
 * candle's own high-low range when there is no previous candle.
 */
function trueRange(candles: OhlcvCandle[], i: number): number {
  const c = candles[i];
  if (i === 0) return c.high - c.low;
  const prevClose = candles[i - 1].close;
  return Math.max(
    c.high - c.low,
    Math.abs(c.high - prevClose),
    Math.abs(c.low - prevClose),
  );
}

/**
 * Simple rolling ATR (average of the last `period` true ranges) at index i.
 * Returns undefined when there is not enough history.
 */
export function atrAt(candles: OhlcvCandle[], i: number, period: number): number | undefined {
  if (i < period) return undefined;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += trueRange(candles, j);
  return sum / period;
}
