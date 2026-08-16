/**
 * Regime Engine
 *
 * Deterministic, causal market regime classifier.
 *
 * Invariants:
 * - At timestamp T only candles with timestamp <= T are used.
 * - Features are pure functions of the provided lookback window.
 * - No network, no randomness, no LLM.
 */

import type {
  CandleLike,
  MarketRegime,
  RegimeClassifierOptions,
  RegimeFeatures,
  RegimeRule,
  RegimeSnapshot,
} from './regime-types';

/**
 * Compute realized volatility (annualized) over `candles`.
 * Assumes evenly spaced candles; returns null on insufficient data.
 */
export function realizedVolatility(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (prev <= 0 || curr <= 0) continue;
    returns.push(Math.log(curr / prev));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const daily = Math.sqrt(variance);
  // Assume 365 trading periods per year (configurable in future).
  return daily * Math.sqrt(365);
}

/** Average True Range over the last `n` candles. */
export function averageTrueRange(candles: CandleLike[], n = candles.length): number | null {
  if (candles.length < 2) return null;
  const subset = candles.slice(-n);
  const trs: number[] = [];
  for (let i = 1; i < subset.length; i++) {
    const prevClose = subset[i - 1]!.close;
    const h = subset[i]!.high;
    const l = subset[i]!.low;
    const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
    trs.push(tr);
  }
  if (trs.length === 0) return null;
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

/** Linear regression slope of close prices over `candles`. */
export function closeSlope(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  const n = candles.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = candles[i]!.close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** ADX-like trend strength in [0, 100]. */
export function trendStrength(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  // Simplified directional movement using +DI / -DI heuristic:
  const n = Math.min(candles.length, 14);
  const window = candles.slice(-n);
  let plusDm = 0;
  let minusDm = 0;
  for (let i = 1; i < window.length; i++) {
    const upMove = window[i]!.high - window[i - 1]!.high;
    const downMove = window[i - 1]!.low - window[i]!.low;
    if (upMove > downMove && upMove > 0) plusDm += upMove;
    if (downMove > upMove && downMove > 0) minusDm += downMove;
  }
  const trSum = averageTrueRange(window, window.length);
  if (trSum === null || trSum === 0) return 0;
  const plusDi = 100 * (plusDm / trSum);
  const minusDi = 100 * (minusDm / trSum);
  const denom = plusDi + minusDi;
  if (denom === 0) return 0;
  return (100 * Math.abs(plusDi - minusDi)) / denom;
}

/** Std dev of returns over lookback (non-annualized). */
export function returnDispersion(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (prev <= 0 || curr <= 0) continue;
    returns.push(Math.log(curr / prev));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

/** Volume z-score vs lookback mean/std. */
export function volumeAbnormality(candles: CandleLike[]): number | null {
  if (candles.length < 2) return null;
  const vols = candles.map((c) => c.volume);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  if (mean === 0) return 0;
  const std = Math.sqrt(vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length);
  if (std === 0) return 0;
  const last = candles[candles.length - 1]!.volume;
  return (last - mean) / std;
}

/** Assemble features from a causal window ending at or before the latest ts. */
export function computeRegimeFeatures(candles: CandleLike[]): RegimeFeatures {
  return {
    realizedVol: realizedVolatility(candles),
    atr: averageTrueRange(candles),
    closeSlope: closeSlope(candles),
    trendStrength: trendStrength(candles),
    returnDispersion: returnDispersion(candles),
    volumeAbnormality: volumeAbnormality(candles),
  };
}

/** Choose matching rule, with fallback UNKNOWN. */
export function pickRegime(
  features: RegimeFeatures,
  rules: RegimeRule[],
  fallback: MarketRegime = 'UNKNOWN',
): MarketRegime {
  // If every feature is null, we have no causal information — do not guess.
  const allNull =
    features.realizedVol === null &&
    features.atr === null &&
    features.closeSlope === null &&
    features.trendStrength === null &&
    features.returnDispersion === null &&
    features.volumeAbnormality === null;
  if (allNull) return 'UNKNOWN';
  for (const rule of rules) {
    if (rule.matches(features)) return rule.regime;
  }
  return fallback;
}

/** Default rules tuned for crypto OHLCV. Thresholds are deliberately simple. */
export function defaultRules(): RegimeRule[] {
  return [
    {
      regime: 'SHOCK',
      description: 'Extreme volume spike with large absolute returns',
      matches: (f) =>
        (f.volumeAbnormality ?? 0) > 3 &&
        (f.returnDispersion ?? 0) > 0.05,
    },
    {
      regime: 'TREND_UP',
      description: 'Strong positive slope with moderate-to-high trend strength',
      matches: (f) =>
        (f.closeSlope ?? 0) > 0 &&
        (f.trendStrength ?? 0) >= 25,
    },
    {
      regime: 'TREND_DOWN',
      description: 'Strong negative slope with moderate-to-high trend strength',
      matches: (f) =>
        (f.closeSlope ?? 0) < 0 &&
        (f.trendStrength ?? 0) >= 25,
    },
    {
      regime: 'HIGH_VOLATILITY',
      description: 'Realized vol above median guess (≥ 1.0 annualized)',
      matches: (f) =>
        (f.realizedVol ?? 0) >= 1.0,
    },
    {
      regime: 'LOW_VOLATILITY',
      description: 'Realized vol below 0.4 annualized and no trend',
      matches: (f) =>
        (f.realizedVol ?? 1) < 0.4 &&
        (f.trendStrength ?? 1) < 20 &&
        (f.returnDispersion ?? 1) < 0.01,
    },
    {
      regime: 'RANGE',
      description: 'No trend and vol not extreme',
      matches: (f) =>
        (f.trendStrength ?? 1) < 20 &&
        (f.returnDispersion ?? 0) < 0.03,
    },
  ];
}

/**
 * Build a RegimeSnapshot for a timestamp using only candles at or before `ts`.
 *
 * The caller is responsible for slicing `candles` to the lookback window.
 * The engine does not mutate input candles.
 */
export function classifyRegime(
  options: RegimeClassifierOptions,
  candles: CandleLike[],
  rules?: RegimeRule[],
): RegimeSnapshot {
  if (candles.length === 0) {
    return {
      timestamp: options.timeframe,
      market: options.market,
      timeframe: options.timeframe,
      features: {
        realizedVol: null,
        atr: null,
        closeSlope: null,
        trendStrength: null,
        returnDispersion: null,
        volumeAbnormality: null,
      },
      regime: 'UNKNOWN',
      explanation: 'No candles provided',
    };
  }
  const features = computeRegimeFeatures(candles);
  const selected = rules ?? defaultRules();
  const regime = pickRegime(features, selected, 'UNKNOWN');
  const explanation = buildExplanation(regime, features, selected);
  return {
    timestamp: candles[candles.length - 1]?.timestamp ?? options.timeframe,
    market: options.market,
    timeframe: options.timeframe,
    features,
    regime,
    explanation,
  };
}

export function buildExplanation(
  regime: MarketRegime,
  features: RegimeFeatures,
  rules: RegimeRule[],
): string {
  const rule = rules.find((r) => r.regime === regime);
  if (rule) return rule.description;
  return `Regime=${regime} (no matching rule; default classifier)`;
}