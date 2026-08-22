/**
 * Monte Carlo Permutation Test
 *
 * Shuffles the order of trade PnLs to test whether the observed path
 * (Sharpe / max drawdown) is significantly better than a random ordering of
 * the same trades. Null hypothesis: observed metrics are no better than
 * random permutations. Deterministic via seeded PRNG — same seed, same result.
 */

import {
  annualizedSharpe,
  DEFAULT_BARS_PER_YEAR,
  DEFAULT_N_SIMULATIONS,
  DEFAULT_SIMULATION_SEED,
  mean,
  mulberry32,
  percentile,
  stdDev,
} from './validation-types';
import type { MonteCarloOptions, MonteCarloResult } from './validation-types';

const MIN_TRADES = 3;

interface PathMetrics {
  sharpe: number;
  /** Negative fraction, e.g. -0.12 = 12% drawdown. */
  maxDrawdown: number;
}

/** Sharpe + max drawdown of a PnL sequence rebuilt on top of initial capital. */
function computePathMetrics(
  pnls: readonly number[],
  initialCapital: number,
  barsPerYear: number,
): PathMetrics {
  const equity: number[] = [];
  let running = initialCapital;
  for (const pnl of pnls) {
    running += pnl;
    equity.push(running);
  }

  const returns: number[] = [];
  let prev = initialCapital;
  for (const eq of equity) {
    returns.push(prev !== 0 ? (eq - prev) / prev : 0);
    prev = eq;
  }
  const sharpe = annualizedSharpe(returns, barsPerYear);

  let peak = equity[0]!;
  let maxDrawdown = 0;
  for (const eq of equity) {
    if (eq > peak) peak = eq;
    const denom = peak > 0 ? peak : 1;
    const drawdown = (eq - peak) / denom;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return { sharpe, maxDrawdown };
}

/** In-place Fisher–Yates shuffle driven by the seeded PRNG. */
function fisherYatesShuffle(array: number[], rng: () => number): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i]!;
    array[i] = array[j]!;
    array[j] = tmp;
  }
}

/**
 * Run the Monte Carlo permutation test over trade PnLs.
 * Returns an error object (never throws) when inputs are insufficient.
 */
export function runMonteCarloPermutation(
  pnls: readonly number[],
  options: MonteCarloOptions,
): MonteCarloResult {
  const nSimulations = options.nSimulations ?? DEFAULT_N_SIMULATIONS;
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const barsPerYear = options.barsPerYear ?? DEFAULT_BARS_PER_YEAR;

  if (!Number.isInteger(nSimulations) || nSimulations < 1) {
    return {
      ok: false,
      error: `nSimulations must be an integer >= 1, got ${nSimulations}`,
      pValueSharpe: 1,
    };
  }
  if (!Number.isInteger(seed) || seed < 0) {
    return { ok: false, error: `seed must be an integer >= 0, got ${seed}`, pValueSharpe: 1 };
  }
  if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) {
    return {
      ok: false,
      error: `initialCapital must be a positive finite number, got ${options.initialCapital}`,
      pValueSharpe: 1,
    };
  }
  if (pnls.length < MIN_TRADES) {
    return {
      ok: false,
      error: `need at least ${MIN_TRADES} trades, got ${pnls.length}`,
      pValueSharpe: 1,
    };
  }
  if (pnls.some((p) => !Number.isFinite(p))) {
    return { ok: false, error: 'all PnL values must be finite numbers', pValueSharpe: 1 };
  }

  const pnlArray = [...pnls];
  const actual = computePathMetrics(pnlArray, options.initialCapital, barsPerYear);
  const rng = mulberry32(seed);
  const shuffled = [...pnlArray];
  const simulatedSharpes: number[] = [];
  let sharpeBetterCount = 0;
  let drawdownShallowerCount = 0;

  for (let i = 0; i < nSimulations; i++) {
    fisherYatesShuffle(shuffled, rng);
    const sim = computePathMetrics(shuffled, options.initialCapital, barsPerYear);
    simulatedSharpes.push(sim.sharpe);
    if (sim.sharpe >= actual.sharpe) sharpeBetterCount += 1;
    if (sim.maxDrawdown >= actual.maxDrawdown) drawdownShallowerCount += 1;
  }

  return {
    ok: true,
    actualSharpe: actual.sharpe,
    actualMaxDrawdown: actual.maxDrawdown,
    pValueSharpe: sharpeBetterCount / nSimulations,
    pValueMaxDrawdown: drawdownShallowerCount / nSimulations,
    simulatedSharpeMean: mean(simulatedSharpes),
    simulatedSharpeStd: stdDev(simulatedSharpes),
    simulatedSharpeP5: percentile(simulatedSharpes, 5),
    simulatedSharpeP95: percentile(simulatedSharpes, 95),
    nSimulations,
    nTrades: pnlArray.length,
    seed,
  };
}