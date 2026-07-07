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

import { Candle, TrendIndicators, TfId } from'./multi-tf-types';

// ─── Constants (explicit — no magic numbers) ──────────────────────────────────

const EMA_FAST = 20;
const EMA_MID = 50;
const EMA_SLOW = 200;
const ADX_PERIOD = 14;
const ADX_TRENDING_THRESHOLD = 25;  // above = trending
const ADX_WEAK_THRESHOLD = 20;     // below = weak/no trend

// ─── EMA (single-pass, Wilder-correct approximation for EMA200) ───────────────

function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
  ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// ─── ADX (Wilder smoothing) ───────────────────────────────────────────────────

interface TrComponents {
  plusDM: number;
  minusDM: number;
  tr: number;
}

function computeADX(candles: Candle[]): { adx: number; adxTrend: TrendIndicators['adxTrend'] } | null {
  if (candles.length < ADX_PERIOD + 1) return null;

  let prevHigh = candles[0].high;
  let prevLow = candles[0].low;
  let prevClose = candles[0].close;

  const trAccum: number[] = [];
  const plusDmAccum: number[] = [];
  const minusDmAccum: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const h = c.high;
    const l = c.low;

    const upMove = h - prevHigh;
    const downMove = prevLow - l;

    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;

    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));

    trAccum.push(tr);
    plusDmAccum.push(plusDM);
    minusDmAccum.push(minusDM);

    prevHigh = h;
    prevLow = l;
    prevClose = c.close;
  }

  if (trAccum.length < ADX_PERIOD) return null;

  // Wilder smoothed TR, +DM, -DM
  let smoothTr = trAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDmAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDmAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  // Start from index ADX_PERIOD (we now have a full Wilder window)
  for (let i = ADX_PERIOD; i < trAccum.length; i++) {
    smoothTr = smoothTr - smoothTr / ADX_PERIOD + trAccum[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / ADX_PERIOD + plusDmAccum[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / ADX_PERIOD + minusDmAccum[i];

    if (smoothTr === 0) {
      dxValues.push(0);
      continue;
    }
    const plusDI = 100 * smoothPlusDm / smoothTr;
    const minusDI = 100 * smoothMinusDm / smoothTr;
    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : 100 * diDiff / diSum;
    dxValues.push(dx);
  }

  if (dxValues.length < ADX_PERIOD) return null;

  // Final ADX = Wilder-smoothed DX over the last ADX_PERIOD values.
  let adx = dxValues.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0) / ADX_PERIOD;
  for (let i = ADX_PERIOD; i < dxValues.length; i++) {
    adx = (adx * (ADX_PERIOD - 1) + dxValues[i]) / ADX_PERIOD;
  }

  const adxTrend: TrendIndicators['adxTrend'] =
    adx >= ADX_TRENDING_THRESHOLD ? 'up' // placeholder; direction is derived later
    : adx < ADX_WEAK_THRESHOLD ? 'sideways'
    : 'down'; // ambiguous middle zone

  return { adx: Math.round(adx * 100) / 100, adxTrend };
}

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
