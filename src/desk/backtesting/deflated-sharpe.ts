/**
 * Deflated Sharpe Ratio (Bailey & López de Prado, 2014)
 *
 * Answers: "given that we tried `nTrials` hyperparameter combinations, what is
 * the probability the best observed Sharpe is genuinely above zero rather than
 * the maximum of N noise draws?"
 *
 * Two inputs compound into the answer:
 *   1. Multiple-testing deflation — the expected maximum Sharpe under the null
 *      (Gumbel approximation, see deflated-sharpe-math.ts).
 *   2. Non-normality — the Probabilistic Sharpe Ratio denominator inflates the
 *      standard error for skewed / fat-tailed return series.
 *
 * Sharpe convention: `observedSharpe` is expressed per observation (the same
 * frequency as `sampleLength`), because the estimator variance under the null
 * is 1/n. If the caller holds an annualized Sharpe, pass `periodsPerYear` and
 * it is converted internally.
 */

import { expectedMaxSharpe, normalCdf } from './deflated-sharpe-math';

export interface DeflatedSharpeInput {
  /** Observed Sharpe of the best strategy (per observation unless periodsPerYear is set). */
  observedSharpe: number;
  /** Number of independent trials that produced this Sharpe. Must be a positive integer. */
  nTrials: number;
  /** Number of return observations backing the Sharpe. Must be an integer >= 2. */
  sampleLength: number;
  /** Skewness of the return series. Default 0 (symmetric). */
  skewness?: number;
  /** Kurtosis of the return series, NON-excess (normal = 3). Default 3. */
  kurtosis?: number;
  /**
   * Set when `observedSharpe` is annualized: the Sharpe is divided by
   * sqrt(periodsPerYear) to express it per observation. Omit for per-observation input.
   */
  periodsPerYear?: number;
  /**
   * Standard deviation of the N trial Sharpe estimates under the null.
   * Default 1/sqrt(sampleLength) — the sampling error of a single Sharpe estimate.
   */
  trialSharpeStdDev?: number;
}

export interface DeflatedSharpeResult {
  /** Probability the observed Sharpe is genuinely > 0 after deflation (0–1). */
  probability: number;
  /** Observed Sharpe converted to per-observation units. */
  observedSharpePerPeriod: number;
  /** Expected maximum Sharpe under the null across `nTrials` trials. */
  expectedMaxSharpeUnderNull: number;
  /** Standard deviation used for the null distribution. */
  trialSharpeStdDev: number;
  nTrials: number;
  sampleLength: number;
}

/**
 * Probabilistic Sharpe Ratio: probability the true Sharpe beats `benchmark`.
 *
 * `sharpePerPeriod` and `benchmark` are per-observation; `skewness` and
 * `kurtosis` (non-excess) describe the return series.
 */
export function probabilisticSharpeRatio(
  sharpePerPeriod: number,
  benchmark: number,
  sampleLength: number,
  skewness: number,
  kurtosis: number,
): number {
  const varianceFactor =
    1 - skewness * sharpePerPeriod + ((kurtosis - 1) / 4) * sharpePerPeriod * sharpePerPeriod;
  if (!(varianceFactor > 0)) {
    throw new RangeError(
      `Non-normality terms make the Sharpe standard error undefined ` +
        `(varianceFactor=${varianceFactor}); check skewness/kurtosis`,
    );
  }
  const z =
    ((sharpePerPeriod - benchmark) * Math.sqrt(sampleLength - 1)) / Math.sqrt(varianceFactor);
  return normalCdf(z);
}

/**
 * Deflated Sharpe Ratio: PSR evaluated against the expected maximum Sharpe of
 * `nTrials` null trials instead of against zero.
 *
 * @throws RangeError for non-finite inputs or out-of-range trial counts.
 */
export function deflatedSharpeRatio(input: DeflatedSharpeInput): DeflatedSharpeResult {
  const { observedSharpe, nTrials, sampleLength } = input;
  const skewness = input.skewness ?? 0;
  const kurtosis = input.kurtosis ?? 3;

  if (!Number.isFinite(observedSharpe)) {
    throw new RangeError(`observedSharpe must be finite; got ${observedSharpe}`);
  }
  if (!Number.isInteger(nTrials) || nTrials < 1) {
    throw new RangeError(`nTrials must be an integer >= 1; got ${nTrials}`);
  }
  if (!Number.isInteger(sampleLength) || sampleLength < 2) {
    throw new RangeError(`sampleLength must be an integer >= 2; got ${sampleLength}`);
  }
  if (!Number.isFinite(skewness) || !Number.isFinite(kurtosis)) {
    throw new RangeError('skewness and kurtosis must be finite');
  }

  const periodsPerYear = input.periodsPerYear;
  if (periodsPerYear !== undefined && !(periodsPerYear > 0)) {
    throw new RangeError(`periodsPerYear must be positive; got ${periodsPerYear}`);
  }
  const observedSharpePerPeriod = periodsPerYear
    ? observedSharpe / Math.sqrt(periodsPerYear)
    : observedSharpe;

  const defaultStdDev = 1 / Math.sqrt(sampleLength);
  const trialSharpeStdDev = input.trialSharpeStdDev ?? defaultStdDev;
  if (!(trialSharpeStdDev > 0)) {
    throw new RangeError(`trialSharpeStdDev must be positive; got ${trialSharpeStdDev}`);
  }

  const expectedMax = expectedMaxSharpe(nTrials, trialSharpeStdDev);
  return {
    probability: probabilisticSharpeRatio(
      observedSharpePerPeriod,
      expectedMax,
      sampleLength,
      skewness,
      kurtosis,
    ),
    observedSharpePerPeriod,
    expectedMaxSharpeUnderNull: expectedMax,
    trialSharpeStdDev,
    nTrials,
    sampleLength,
  };
}
