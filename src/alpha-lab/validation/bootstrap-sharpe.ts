/**
 * Bootstrap Sharpe Confidence Interval
 *
 * Resamples per-bar returns with replacement to estimate the sampling
 * distribution of the annualised Sharpe ratio, producing a confidence
 * interval and the probability that Sharpe is positive. Deterministic via
 * seeded PRNG — same seed, same result.
 */

import {
  annualizedSharpe,
  DEFAULT_BARS_PER_YEAR,
  DEFAULT_N_SIMULATIONS,
  DEFAULT_SIMULATION_SEED,
  mulberry32,
  percentile,
} from './validation-types';
import type { BootstrapOptions, BootstrapResult } from './validation-types';

const MIN_RETURNS = 5;

/**
 * Bootstrap the Sharpe ratio from a return series.
 * Returns an error object (never throws) when inputs are insufficient.
 */
export function bootstrapSharpeCi(
  returns: readonly number[],
  options: BootstrapOptions = {},
): BootstrapResult {
  const nBootstrap = options.nBootstrap ?? DEFAULT_N_SIMULATIONS;
  const confidence = options.confidence ?? 0.95;
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const barsPerYear = options.barsPerYear ?? DEFAULT_BARS_PER_YEAR;

  if (!Number.isInteger(nBootstrap) || nBootstrap < 1) {
    return { ok: false, error: `nBootstrap must be an integer >= 1, got ${nBootstrap}` };
  }
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    return { ok: false, error: `confidence must be in (0, 1), got ${confidence}` };
  }
  if (!Number.isInteger(seed) || seed < 0) {
    return { ok: false, error: `seed must be an integer >= 0, got ${seed}` };
  }
  if (returns.length < MIN_RETURNS) {
    return { ok: false, error: `need at least ${MIN_RETURNS} return observations, got ${returns.length}` };
  }
  if (returns.some((r) => !Number.isFinite(r))) {
    return { ok: false, error: 'all return values must be finite numbers' };
  }

  const observedSharpe = annualizedSharpe(returns, barsPerYear);
  const rng = mulberry32(seed);
  const bootSharpes: number[] = [];
  const sample = new Array<number>(returns.length);

  for (let i = 0; i < nBootstrap; i++) {
    for (let j = 0; j < returns.length; j++) {
      sample[j] = returns[Math.floor(rng() * returns.length)]!;
    }
    bootSharpes.push(annualizedSharpe(sample, barsPerYear));
  }

  const alpha = (1 - confidence) / 2;
  const positiveCount = bootSharpes.filter((s) => s > 0).length;

  return {
    ok: true,
    observedSharpe,
    ciLower: percentile(bootSharpes, alpha * 100),
    ciUpper: percentile(bootSharpes, (1 - alpha) * 100),
    medianSharpe: percentile(bootSharpes, 50),
    probPositive: positiveCount / nBootstrap,
    confidence,
    nBootstrap,
    seed,
  };
}