/**
 * Volatility Indicator Suite
 *
 * Computes ATR, Bollinger Bands (20, 2σ), ATR% (ATR / close), Bollinger width%.
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : bbWidthPct is a self-explaining field (tight vs wide bands).
 *  - Explicitness: BB period and multiplier are constants. ATR period is constant.
 *  - Tractability: computedAt set by caller; Bollinger width% allows replaying
 *                 compression/expansion regime.
 */

import { Candle, VolatilityIndicators } from'./multi-tf-types';

const ATR_PERIOD = 14;
const BB_PERIOD = 20;
const BB_STD_MULT = 2;

function computeATR(candles: Candle[]): number {
  if (candles.length < ATR_PERIOD + 1) {
  const tr0 = candles.length >= 2
    ? Math.max(candles[1].high - candles[1].low,
        Math.abs(candles[1].high - candles[0].close),
        Math.abs(candles[1].low - candles[0].close))
    : candles[0].high - candles[0].low;
  return tr0;
  }
  // Initialize TR array
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
  }
  // Wilder seed
  let atr = tr.slice(0, ATR_PERIOD).reduce((a, b) => a + b, 0) / ATR_PERIOD;
  // Wilder smoothing
  for (let i = ATR_PERIOD; i < tr.length; i++) {
    atr = (atr * (ATR_PERIOD - 1) + tr[i]) / ATR_PERIOD;
  }
  return atr;
}

function computeBollinger(candles: Candle[]): { bollingerUpper: number; bollingerMid: number; bollingerLower: number; bollingerWidthPct: number } {
  const closes = candles.map((c) => c.close);
  const slice = closes.slice(-BB_PERIOD);
  if (slice.length < BB_PERIOD) {
    const last = closes[closes.length - 1];
    return { bollingerUpper: last, bollingerMid: last, bollingerLower: last, bollingerWidthPct: 0 };
  }
  const mid = slice.reduce((a, b) => a + b, 0) / BB_PERIOD;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / BB_PERIOD;
  const std = Math.sqrt(variance);
  const upper = mid + BB_STD_MULT * std;
  const lower = mid - BB_STD_MULT * std;
  const widthPct = mid === 0 ? 0 : ((upper - lower) / mid) * 100;
 return {
 bollingerUpper: Math.round(upper * 100) / 100,
 bollingerMid: Math.round(mid * 100) / 100,
 bollingerLower: Math.round(lower * 100) / 100,
 bollingerWidthPct: Math.round(widthPct * 100) / 100,
 };
}

export function computeVolatilityIndicators(tf: string, candles: Candle[]): VolatilityIndicators {
  const atr = computeATR(candles);
  const close = candles[candles.length - 1].close;
  const bb = computeBollinger(candles);
  return {
    atr: Math.round(atr * 100) / 100,
    atrPct: close === 0 ? 0 : Math.round((atr / close) * 10000) / 100, // in %
    ...bb,
  };
}
