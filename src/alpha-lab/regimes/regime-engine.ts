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
import { defaultRules } from './regime-default-rules';

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
export { defaultRules } from './regime-default-rules';

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
