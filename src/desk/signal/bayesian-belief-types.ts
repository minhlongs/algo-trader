/**
 * Bayesian Market Belief Updater Types
 *
 * Contracts for Beta prior-to-posterior conjugacy, pollster variance discounting,
 * and probability confidence interval estimation.
 *
 * @module desk/signal/bayesian-belief-types
 */

export interface BetaDistributionParameters {
  readonly alpha: number;
  readonly beta: number;
}

export interface PollingObservation {
  readonly pollId: string;
  readonly sampleSize: number;
  readonly observedShare: number; // in [0, 1]
  readonly pollsterCredibilityWeight?: number; // 0.0 to 1.0 (default 1.0)
  readonly daysAgo?: number; // Decay factor
}

export interface BayesianBeliefState {
  readonly marketId: string;
  readonly prior: BetaDistributionParameters;
  readonly posterior: BetaDistributionParameters;
  readonly priorMean: number;
  readonly posteriorMean: number;
  readonly posteriorVariance: number;
  readonly credibleInterval95: readonly [number, number];
  readonly totalEffectiveSampleSize: number;
}
