/**
 * Pure EMA and ADX Wilder-smoothing math helpers for Trend Indicator Suite.
 */

import type { Candle, TrendIndicators } from './multi-tf-types';

export const EMA_FAST = 20;
export const EMA_MID = 50;
export const EMA_SLOW = 200;
export const ADX_PERIOD = 14;
export const ADX_TRENDING_THRESHOLD = 25; // above = trending
export const ADX_WEAK_THRESHOLD = 20;     // below = weak/no trend

/**
 * Single-pass Wilder-correct EMA approximation.
 */
export function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * ADX computation with Wilder smoothing over ADX_PERIOD.
 */
export function computeADX(
  candles: Candle[],
): { adx: number; adxTrend: TrendIndicators['adxTrend'] } | null {
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

  let smoothTr = trAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDmAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDmAccum.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0);

  let plusDI = 0;
  let minusDI = 0;
  const dxValues: number[] = [];

  for (let i = ADX_PERIOD; i < trAccum.length; i++) {
    smoothTr = smoothTr - smoothTr / ADX_PERIOD + trAccum[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / ADX_PERIOD + plusDmAccum[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / ADX_PERIOD + minusDmAccum[i];

    if (smoothTr === 0) {
      dxValues.push(0);
      continue;
    }
    plusDI = (100 * smoothPlusDm) / smoothTr;
    minusDI = (100 * smoothMinusDm) / smoothTr;
    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (100 * diDiff) / diSum;
    dxValues.push(dx);
  }

  if (dxValues.length < ADX_PERIOD) return null;

  let adx = dxValues.slice(0, ADX_PERIOD).reduce((a, b) => a + b, 0) / ADX_PERIOD;
  for (let i = ADX_PERIOD; i < dxValues.length; i++) {
    adx = (adx * (ADX_PERIOD - 1) + dxValues[i]) / ADX_PERIOD;
  }

  const adxTrend: TrendIndicators['adxTrend'] =
    adx < ADX_WEAK_THRESHOLD ? 'sideways'
    : plusDI > minusDI ? 'up'
    : minusDI > plusDI ? 'down'
    : 'sideways';

  return { adx: Math.round(adx * 100) / 100, adxTrend };
}
