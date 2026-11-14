/**
 * Bootstrap statistics primitives.
 *
 * Seeded PRNG, percentile, and the default (mean) statistic used by the
 * stationary block bootstrap.
 *
 * Deliberately self-contained: alpha-lab already imports desk/backtesting
 * (metrics-calculator), so desk/backtesting must not import alpha-lab back.
 * These primitives follow the same mulberry32 / linear-interpolated percentile
 * conventions used across the repository, so results stay reproducible.
 */

/**
 * Seeded PRNG (mulberry32). Deterministic across runs for a given seed.
 * Returns values in [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default bootstrap statistic: arithmetic mean of the sample. */
export function meanStatistic(sample: readonly number[]): number {
  if (sample.length === 0) return 0;
  let sum = 0;
  for (const value of sample) sum += value;
  return sum / sample.length;
}

/** Linear-interpolated percentile, p in [0, 100]. Input is not mutated. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}
