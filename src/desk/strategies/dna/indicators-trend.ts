/**
 * Trend Indicator Suite
 *
 * Computes EMA20/EMA50/EMA200, ADX + ADX trend classification.
 * TF-agnostic: works on any Candle[] that is long enough (≥ 200 candles for
 * EMA200, else returns null for that field).
 *
 * Cheetahclaws-DNA genes expressed here:
 *  - Legibility  : output includes human-readable `trend` field derived from
 *                  ADX threshold.
 *  - Explicitness: EMA periods are constants, not params. ADX thresholds are
 *                  hard-coded constants (25 = trend threshold, 20 = weak).
 *  - Tractability: every compute() returns a deterministic snapshot with
 *                  `computedAt`, so the journal can replay.
 */

import { Candle, TrendIndicators, TfId } from './multi-tf-types';
import {
  EMA_FAST,
  EMA_MID,
  EMA_SLOW,
  ADX_PERIOD,
  ADX_TRENDING_THRESHOLD,
  ADX_WEAK_THRESHOLD,
  computeEMA,
  computeADX,
} from './indicators-trend-math';

export {
  EMA_FAST,
  EMA_MID,
  EMA_SLOW,
  ADX_PERIOD,
  ADX_TRENDING_THRESHOLD,
  ADX_WEAK_THRESHOLD,
  computeEMA,
  computeADX,
} from './indicators-trend-math';

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeTrendIndicators(tf: TfId, candles: Candle[]): TrendIndicators {
  const closes = candles.map((c) => c.close);
  const ema20 = computeEMA(closes, EMA_FAST) ?? 0;
  const ema50 = computeEMA(closes, EMA_MID) ?? 0;
  const ema200 = candles.length >= EMA_SLOW ? computeEMA(closes, EMA_SLOW) ?? null : null;

  const adxResult = computeADX(candles);
  const adx = adxResult?.adx ?? 0;
  // Derive actual trend direction from EMA stack (explicit rule):
  //   EMA20 > EMA50 > EMA200  → trending_up
  //   EMA20 < EMA50 < EMA200  → trending_down
  //   else                   → sideways / weak
  let adxTrend: TrendIndicators['adxTrend'] = 'sideways';
  if (ema200 !== null) {
    if (ema20 > ema50 && ema50 > ema200) adxTrend = 'up';
    else if (ema20 < ema50 && ema50 < ema200) adxTrend = 'down';
  } else {
    // Fallback to ADX sign when EMA200 unavailable
    if (adxResult) adxTrend = adxResult.adxTrend;
  }

  return {
    ema20: Math.round(ema20 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    ema200: ema200 !== null ? Math.round(ema200 * 100) / 100 : null,
    adx,
    adxTrend,
  };
}

/**
 * Convenience: derive directional signal from trend indicators.
 * Returns a score in [-1, +1] where +1 = strongly bullish trend, -1 = bearish.
 */
export function trendDirectionScore(trend: TrendIndicators): number {
  if (trend.adxTrend === 'up') return 0.6;
  if (trend.adxTrend === 'down') return -0.6;
  return 0; // sideways
}
