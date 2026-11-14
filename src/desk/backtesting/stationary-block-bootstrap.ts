/**
 * Politis–Romano Stationary Block Bootstrap
 *
 * Resamples an ordered series with geometric block lengths so serial
 * correlation survives the resample (unlike an iid bootstrap, which destroys
 * it). Used to attach a percentile confidence interval to a backtest statistic.
 *
 * Reference: Politis, D. N. & Romano, J. P. (1994), "The Stationary Bootstrap",
 * Journal of the American Statistical Association 89(428).
 *
 * Deterministic for a given seed. No dependencies.
 */

import { createSeededRandom, meanStatistic, percentile } from './bootstrap-statistics-primitives';

export interface StationaryBootstrapOptions {
  /** Number of resamples. Default 1000. Must be a positive integer. */
  resamples?: number;
  /**
   * Mean block length in observations. Default 10. Must be >= 1.
   * Individual block lengths are geometric with this mean; the series wraps
   * circularly, so the resample always has the same length as the input.
   */
  meanBlockLength?: number;
  /** Confidence level in (0, 1). Default 0.95. */
  confidence?: number;
  /** PRNG seed. Default 42. Must be a non-negative integer. */
  seed?: number;
  /** Statistic applied to each resample. Default: arithmetic mean. */
  statistic?: (sample: readonly number[]) => number;
}

export interface StationaryBootstrapResult {
  /** Statistic evaluated on the observed (unresampled) series. */
  observed: number;
  /** Lower percentile bound of the confidence interval. */
  lower: number;
  /** Upper percentile bound of the confidence interval. */
  upper: number;
  /** Median of the bootstrap distribution. */
  median: number;
  confidence: number;
  resamples: number;
  meanBlockLength: number;
  seed: number;
  /** Number of observations in the input series. */
  sampleLength: number;
}

export const DEFAULT_STATIONARY_BOOTSTRAP_OPTIONS = {
  resamples: 1000,
  meanBlockLength: 10,
  confidence: 0.95,
  seed: 42,
} as const;

/**
 * Draw one stationary-bootstrap resample.
 *
 * Each position starts a new block with probability 1/meanBlockLength and
 * otherwise continues the previous block. Indices advance circularly, which is
 * what makes the resample "stationary" rather than fixed-length-blocked.
 */
function drawResample(
  series: readonly number[],
  meanBlockLength: number,
  random: () => number,
): number[] {
  const n = series.length;
  const restartProbability = 1 / meanBlockLength;
  const sample = new Array<number>(n);
  let index = Math.floor(random() * n);
  for (let i = 0; i < n; i++) {
    if (i > 0 && random() < restartProbability) {
      index = Math.floor(random() * n);
    } else if (i > 0) {
      index = (index + 1) % n;
    }
    sample[i] = series[index];
  }
  return sample;
}

/**
 * Compute a percentile confidence interval for `statistic` on `series`.
 *
 * @throws RangeError when the series is empty, a numeric option is out of
 *         range, or the series contains non-finite values.
 */
export function stationaryBlockBootstrap(
  series: readonly number[],
  options: StationaryBootstrapOptions = {},
): StationaryBootstrapResult {
  if (series.length === 0) {
    throw new RangeError('stationaryBlockBootstrap requires a non-empty series');
  }
  for (let i = 0; i < series.length; i++) {
    if (!Number.isFinite(series[i])) {
      throw new RangeError(`Series contains a non-finite value at index ${i}`);
    }
  }

  const resamples = options.resamples ?? DEFAULT_STATIONARY_BOOTSTRAP_OPTIONS.resamples;
  const meanBlockLength = options.meanBlockLength ?? DEFAULT_STATIONARY_BOOTSTRAP_OPTIONS.meanBlockLength;
  const confidence = options.confidence ?? DEFAULT_STATIONARY_BOOTSTRAP_OPTIONS.confidence;
  const seed = options.seed ?? DEFAULT_STATIONARY_BOOTSTRAP_OPTIONS.seed;
  const statistic = options.statistic ?? meanStatistic;

  if (!Number.isInteger(resamples) || resamples < 1) {
    throw new RangeError(`resamples must be an integer >= 1; got ${resamples}`);
  }
  if (!Number.isFinite(meanBlockLength) || meanBlockLength < 1) {
    throw new RangeError(`meanBlockLength must be a finite number >= 1; got ${meanBlockLength}`);
  }
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError(`confidence must be in (0, 1); got ${confidence}`);
  }
  if (!Number.isInteger(seed) || seed < 0) {
    throw new RangeError(`seed must be a non-negative integer; got ${seed}`);
  }

  const random = createSeededRandom(seed);
  const distribution = new Array<number>(resamples);
  for (let b = 0; b < resamples; b++) {
    distribution[b] = statistic(drawResample(series, meanBlockLength, random));
  }

  const alpha = ((1 - confidence) / 2) * 100;
  return {
    observed: statistic(series),
    lower: percentile(distribution, alpha),
    upper: percentile(distribution, 100 - alpha),
    median: percentile(distribution, 50),
    confidence,
    resamples,
    meanBlockLength,
    seed,
    sampleLength: series.length,
  };
}
