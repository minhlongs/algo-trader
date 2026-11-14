/**
 * Robustness Metrics Wiring
 *
 * Ties the four robustness primitives together into one call:
 *
 *   returns (+ per-observation liquidity) → 4 liquidity regimes
 *        → Stationary Block Bootstrap 95% CI (overall and per regime)
 *        → Deflated Sharpe (given the number of trials that produced the strategy)
 *
 * Everything here is additive to `MetricsReport`; existing callers are
 * unaffected. Per-observation Sharpe is computed from the returns themselves so
 * the deflation is frequency-consistent with `sampleLength`.
 */

import {
  classifyLiquiditySeries,
  DEFAULT_LIQUIDITY_REGIME_THRESHOLDS,
  LIQUIDITY_REGIMES,
  type LiquidityObservation,
  type LiquidityRegime,
  type LiquidityRegimeThresholds,
} from './liquidity-regimes';
import {
  stationaryBlockBootstrap,
  type StationaryBootstrapOptions,
  type StationaryBootstrapResult,
} from './stationary-block-bootstrap';
import { deflatedSharpeRatio, type DeflatedSharpeResult } from './deflated-sharpe';

export interface RobustnessMetricsOptions extends StationaryBootstrapOptions {
  /**
   * Liquidity observation per return, same length and order as `returns`.
   * When omitted, only the overall interval is computed and `perRegime` is empty.
   */
  liquidity?: readonly LiquidityObservation[];
  /** Override the documented regime thresholds. */
  regimeThresholds?: LiquidityRegimeThresholds;
  /** Number of hyperparameter combinations tried. Default 1 (no deflation). */
  nTrials?: number;
  /** Override sample skewness (default: computed from `returns`). */
  skewness?: number;
  /** Override NON-excess kurtosis (default: computed from `returns`). */
  kurtosis?: number;
}

export interface RobustnessMetrics {
  sampleLength: number;
  /** Confidence interval over the full return series. */
  overall: StationaryBootstrapResult;
  /** One bucket per regime; `null` when that regime has no observations. */
  perRegime: Record<LiquidityRegime, StationaryBootstrapResult | null>;
  /** Observation counts behind each per-regime interval. */
  regimeCounts: Record<LiquidityRegime, number>;
  /** Deflated Sharpe for the observed per-observation Sharpe. */
  deflatedSharpe: DeflatedSharpeResult;
}

/** Convert an equity curve into simple per-observation returns. */
export function equityCurveToReturns(
  equityCurve: ReadonlyArray<{ equity: number }>,
): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const previous = equityCurve[i - 1].equity;
    if (previous !== 0) returns.push((equityCurve[i].equity - previous) / previous);
  }
  return returns;
}

/** Per-observation Sharpe (mean / sample std). Returns 0 for a degenerate series. */
export function computePerPeriodSharpe(returns: readonly number[]): number {
  const n = returns.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const value of returns) sum += value;
  const mean = sum / n;
  let squaredDeviations = 0;
  for (const value of returns) squaredDeviations += (value - mean) ** 2;
  const std = Math.sqrt(squaredDeviations / (n - 1));
  if (!(std > 1e-12)) return 0;
  return mean / std;
}

/** Sample skewness (biased estimator, matches the third standard moment). */
export function computeSkewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / n;
  let m2 = 0;
  let m3 = 0;
  for (const value of values) {
    const deviation = value - mean;
    m2 += deviation * deviation;
    m3 += deviation * deviation * deviation;
  }
  m2 /= n;
  m3 /= n;
  if (!(m2 > 0)) return 0;
  return m3 / Math.pow(m2, 1.5);
}

/**
 * Sample kurtosis, NON-excess (normal = 3), consistent with `DeflatedSharpeInput`.
 */
export function computeKurtosis(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 3;
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / n;
  let m2 = 0;
  let m4 = 0;
  for (const value of values) {
    const deviation = value - mean;
    m2 += deviation * deviation;
    m4 += deviation * deviation * deviation * deviation;
  }
  m2 /= n;
  m4 /= n;
  if (!(m2 > 0)) return 3;
  return m4 / (m2 * m2);
}

/**
 * Compute overall and per-regime bootstrap confidence intervals plus the
 * Deflated Sharpe for a return series.
 *
 * @throws RangeError when `returns` has fewer than 2 finite observations, or
 *         when `liquidity` is supplied with a different length than `returns`.
 */
export function computeRobustnessMetrics(
  returns: readonly number[],
  options: RobustnessMetricsOptions = {},
): RobustnessMetrics {
  if (returns.length < 2) {
    throw new RangeError(
      `computeRobustnessMetrics requires at least 2 returns; got ${returns.length}`,
    );
  }
  const { liquidity, regimeThresholds, ...bootstrapOptions } = options;

  if (liquidity && liquidity.length !== returns.length) {
    throw new RangeError(
      `liquidity length (${liquidity.length}) must match returns length (${returns.length})`,
    );
  }

  const overall = stationaryBlockBootstrap(returns, bootstrapOptions);

  const perRegime = {} as Record<LiquidityRegime, StationaryBootstrapResult | null>;
  const regimeCounts = {} as Record<LiquidityRegime, number>;
  const labels = liquidity
    ? classifyLiquiditySeries(liquidity, regimeThresholds ?? DEFAULT_LIQUIDITY_REGIME_THRESHOLDS)
    : null;

  for (const regime of LIQUIDITY_REGIMES) {
    const bucket = labels
      ? returns.filter((_, index) => labels[index] === regime)
      : [];
    regimeCounts[regime] = bucket.length;
    perRegime[regime] = bucket.length >= 2 ? stationaryBlockBootstrap(bucket, bootstrapOptions) : null;
  }

  const observedSharpe = computePerPeriodSharpe(returns);
  const deflatedSharpe = deflatedSharpeRatio({
    observedSharpe,
    nTrials: options.nTrials ?? 1,
    sampleLength: returns.length,
    skewness: options.skewness ?? computeSkewness(returns),
    kurtosis: options.kurtosis ?? computeKurtosis(returns),
  });

  return {
    sampleLength: returns.length,
    overall,
    perRegime,
    regimeCounts,
    deflatedSharpe,
  };
}
