/**
 * Shared fixtures for regime-detector tests.
 *
 * Exports candle/TimeframeIndicators helpers so that
 * `regime-detector.test.ts` and `regime-detector-freshness.test.ts`
 * share identical input construction.
 */

import type { TimeframeIndicators, Candle, TfId } from '../multi-tf-types.js';

export function makeCandle(close: number): Candle {
  return {
    timestamp: Date.now(),
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume: 100,
  };
}

export function candlesFor(count: number, base: number): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(base + i * 0.5));
}

export function baseTf(tf: TfId): Omit<TimeframeIndicators, 'trend' | 'momentum' | 'volatility' | 'microstructure'> {
  return {
    tf,
    candles: candlesFor(210, 100),
    computedAt: Date.now(),
  };
}

export function trendingUpTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 210, ema50: 200, ema200: 180, adx: 35, adxTrend: 'up' },
    momentum: { rsi: 65, macdLine: 1.2, macdSignal: 0.8, macdHist: 0.4 },
    volatility: { atr: 1.5, atrPct: 0.5, bollingerUpper: 215, bollingerMid: 205, bollingerLower: 195, bollingerWidthPct: 0.095 },
    microstructure: { obi: 0.4, vwap: 205, deltaCandle: 50 },
  };
}

export function trendingDownTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 190, ema50: 200, ema200: 220, adx: 30, adxTrend: 'down' },
    momentum: { rsi: 35, macdLine: -1.0, macdSignal: -0.6, macdHist: -0.4 },
    volatility: { atr: 1.4, atrPct: 0.45, bollingerUpper: 195, bollingerMid: 200, bollingerLower: 205, bollingerWidthPct: 0.048 },
    microstructure: { obi: -0.3, vwap: 195, deltaCandle: -40 },
  };
}

export function rangingTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 200, ema50: 200, ema200: 200, adx: 15, adxTrend: 'sideways' },
    momentum: { rsi: 50, macdLine: 0.1, macdSignal: 0.0, macdHist: 0.1 },
    volatility: { atr: 1.0, atrPct: 0.35, bollingerUpper: 205, bollingerMid: 200, bollingerLower: 195, bollingerWidthPct: 0.05 },
    microstructure: { obi: 0.05, vwap: 200, deltaCandle: 5 },
  };
}

export function volatileTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 210, ema50: 205, ema200: 190, adx: 20, adxTrend: 'sideways' },
    momentum: { rsi: 55, macdLine: 0.5, macdSignal: 0.4, macdHist: 0.1 },
    volatility: { atr: 10, atrPct: 5, bollingerUpper: 240, bollingerMid: 200, bollingerLower: 160, bollingerWidthPct: 0.40 },
    microstructure: { obi: 0.1, vwap: 200, deltaCandle: 10 },
  };
}
