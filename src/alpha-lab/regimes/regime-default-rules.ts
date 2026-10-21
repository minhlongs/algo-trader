/**
 * Default Regime Rules
 *
 * The threshold table the deterministic regime classifier uses when the caller
 * supplies no custom rules. Kept separate from the classifier so rule tuning is
 * an isolated, reviewable change.
 *
 * Order matters: the first matching rule wins, so the most specific regimes
 * (SHOCK, directional trends) precede the broad buckets (volume bands, RANGE).
 */

import type { RegimeRule } from './regime-types';

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
