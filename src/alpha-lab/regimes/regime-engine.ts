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
import {
  realizedVolatility,
  averageTrueRange,
  closeSlope,
  trendStrength,
  returnDispersion,
  volumeAbnormality,
  computeRegimeFeatures,
} from './regime-features';

export {
  realizedVolatility,
  averageTrueRange,
  closeSlope,
  trendStrength,
  returnDispersion,
  volumeAbnormality,
  computeRegimeFeatures,
};

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
    timestamp: candles[candles.length - 1]!.timestamp,
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
