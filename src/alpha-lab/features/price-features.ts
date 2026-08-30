/**
 * Price Features
 *
 * Returns, momentum, volatility, and breakout state.
 */

import type { FeatureDefinition, FeatureContext, FeatureFn } from './feature-types';

export const simpleReturn: FeatureDefinition = {
  name: 'simple_return',
  timeframe: 'any',
  source: 'price',
  lookback: 2,
  causal: true,
  description: '(close_t - close_{t-1}) / close_{t-1}',
};

export const logReturn: FeatureDefinition = {
  name: 'log_return',
  timeframe: 'any',
  source: 'price',
  lookback: 2,
  causal: true,
  description: 'ln(close_t / close_{t-1})',
};

export const atr: FeatureDefinition = {
  name: 'atr',
  timeframe: 'any',
  source: 'price',
  lookback: 14,
  causal: true,
  description: 'Average True Range over lookback',
};

export const realizedVolatility: FeatureDefinition = {
  name: 'realized_volatility',
  timeframe: 'any',
  source: 'price',
  lookback: 20,
  causal: true,
  description: 'Annualized realized volatility from log returns',
};

export const momentum: FeatureDefinition = {
  name: 'momentum',
  timeframe: 'any',
  source: 'price',
  lookback: 14,
  causal: true,
  description: '(close_t - close_{t-lookback}) / close_{t-lookback}',
};

export const maDistance: FeatureDefinition = {
  name: 'ma_distance',
  timeframe: 'any',
  source: 'price',
  lookback: 20,
  causal: true,
  description: '(close_t - SMA(lookback)) / SMA(lookback)',
};

export const breakoutState: FeatureDefinition = {
  name: 'breakout_state',
  timeframe: 'any',
  source: 'price',
  lookback: 20,
  causal: true,
  description: '1 if close > rolling high_{lookback-1}, -1 if close < rolling low_{lookback-1}, 0 otherwise',
};

export function computeSimpleReturn(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const prev = ctx.candles[ctx.candles.length - 2]!.close;
  const curr = ctx.candles[ctx.candles.length - 1]!.close;
  if (prev <= 0 || curr <= 0) return null;
  return (curr - prev) / prev;
}

export function computeLogReturn(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const prev = ctx.candles[ctx.candles.length - 2]!.close;
  const curr = ctx.candles[ctx.candles.length - 1]!.close;
  if (prev <= 0 || curr <= 0) return null;
  return Math.log(curr / prev);
}

export function computeAtr(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const window = ctx.candles.slice(-ctx.candles.length);
  const trs: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1]!.close;
    const h = window[i]!.high;
    const l = window[i]!.low;
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    trs.push(tr);
  }
  // trs.length === window.length - 1, which is >= 1 whenever we reach here
  // (ctx.candles.length >= 2), so the division is always well-formed.
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

export function computeRealizedVolatility(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < ctx.candles.length; i++) {
    const prev = ctx.candles[i - 1]!.close;
    const curr = ctx.candles[i]!.close;
    if (prev <= 0 || curr <= 0) continue;
    returns.push(Math.log(curr / prev));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const daily = Math.sqrt(variance);
  return daily * Math.sqrt(365);
}

export function computeMomentum(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const window = ctx.candles.slice(-ctx.candles.length);
  const first = window[0]!.close;
  const last = window[window.length - 1]!.close;
  if (first <= 0 || last <= 0) return null;
  return (last - first) / first;
}

export function computeMaDistance(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const window = ctx.candles.slice(-ctx.candles.length);
  const sma = window.reduce((s, c) => s + c.close, 0) / window.length;
  if (sma <= 0) return null;
  return (window[window.length - 1]!.close - sma) / sma;
}

export function computeBreakoutState(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const window = ctx.candles.slice(-ctx.candles.length);
  const curr = window[window.length - 1]!.close;
  const prevHigh = Math.max(...window.slice(0, -1).map((c) => c.high));
  const prevLow = Math.min(...window.slice(0, -1).map((c) => c.low));
  if (curr > prevHigh) return 1;
  if (curr < prevLow) return -1;
  return 0;
}

export const PRICE_FEATURES: Record<string, { def: FeatureDefinition; compute: FeatureFn }> = {
  simple_return: { def: simpleReturn, compute: computeSimpleReturn },
  log_return: { def: logReturn, compute: computeLogReturn },
  atr: { def: atr, compute: computeAtr },
  realized_volatility: { def: realizedVolatility, compute: computeRealizedVolatility },
  momentum: { def: momentum, compute: computeMomentum },
  ma_distance: { def: maDistance, compute: computeMaDistance },
  breakout_state: { def: breakoutState, compute: computeBreakoutState },
};