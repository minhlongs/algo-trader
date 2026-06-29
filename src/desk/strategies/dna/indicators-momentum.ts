/**
 * Momentum Indicator Suite
 *
 * Computes RSI(14), MACD line / signal / histogram.
 * TF-agnostic; uses standard Wilder parameters.
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : returns named fields; caller sees "rsi=72 → overbought" at
 *                  a glance without computing the threshold manually.
 *  - Explicitness: RSI period, MACD params are top-of-file constants.
 *  - Tractability: computedAt is set by caller so replay is consistent.
 */

import { Candle, MomentumIndicators } from './multi-tf-types.js';

const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;

// ─── RSI ──────────────────────────────────────────────────────────────────────

function computeRSI(candles: Candle[]): number {
  if (candles.length < RSI_PERIOD + 1) return 50;

  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
  changes.push(candles[i].close - candles[i - 1].close);
  }

  // Seed with first PERIOD gains/losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < RSI_PERIOD; i++) {
    const g = Math.max(0, changes[i]);
    const l = Math.max(0, -changes[i]);
    avgGain += g;
    avgLoss += l;
  }
  avgGain /= RSI_PERIOD;
  avgLoss /= RSI_PERIOD;

  // Wilder smoothing
  for (let i = RSI_PERIOD; i < changes.length; i++) {
    const g = Math.max(0, changes[i]);
    const l = Math.max(0, -changes[i]);
    avgGain = (avgGain * (RSI_PERIOD - 1) + g) / RSI_PERIOD;
    avgLoss = (avgLoss * (RSI_PERIOD - 1) + l) / RSI_PERIOD;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

// ─── EMA helper ───────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
  prev = values[i] * k + prev * (1 - k);
  result.push(prev);
  }
  return result;
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

function computeMACD(candles: Candle[]): { macdLine: number; macdSignal: number; macdHist: number } {
  const closes = candles.map((c) => c.close);
  if (closes.length < MACD_SLOW + MACD_SIGNAL) {
  return { macdLine: 0, macdSignal: 0, macdHist: 0 };
  }
  const fastEma = ema(closes, MACD_FAST);
  const slowEma = ema(closes, MACD_SLOW);
  // Align: slow starts later; take the tail where both exist.
  const offset = slowEma.length - fastEma.length;
  const macdLine = fastEma.slice(offset > 0 ? offset : 0);
  // Actually the fastEma and slowEma have different lengths — align from the end.
  const minLen = Math.min(fastEma.length, slowEma.length);
  const macd = fastEma.slice(fastEma.length - minLen).map((v, i) => v - slowEma[slowEma.length - minLen + i]);
  const signalLine = ema(macd, MACD_SIGNAL);
  const sigOffset = signalLine.length - macd.length;
  const alignedSignal = sigOffset > 0 ? signalLine[sigOffset] : signalLine[0];
  const hist = macd[macd.length - 1] - alignedSignal;
  return {
  macdLine: Math.round(macd[macd.length - 1] * 100) / 100,
  macdSignal: Math.round(alignedSignal * 100) / 100,
  macdHist: Math.round(hist * 100) / 100,
};
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function computeMomentumIndicators(_tf: string, candles: Candle[]): MomentumIndicators {
  return {
    rsi: computeRSI(candles),
    ...computeMACD(candles),
  };
}

export function momentumDirection(indicators: MomentumIndicators): number {
  // Score in [-1, +1] driven primarily by RSI + MACD histogram sign.
  const rsi = indicators.rsi;
  const hist = indicators.macdHist;
  let score = 0;
  if (rsi > 60) score += 0.3;
  else if (rsi < 40) score -= 0.3;
  if (hist > 0) score += 0.4;
  else if (hist < 0) score -= 0.4;
  return Math.max(-1, Math.min(1, score));
}
