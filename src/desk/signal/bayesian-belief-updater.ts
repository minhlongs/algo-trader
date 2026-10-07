import type {
  BayesianBeliefState,
  BetaDistributionParameters,
  PollingObservation,
} from './bayesian-belief-types';

export class BayesianMarketBeliefUpdater {
  public computeMean(params: BetaDistributionParameters): number {
    return params.alpha / (params.alpha + params.beta);
  }

  public computeVariance(params: BetaDistributionParameters): number {
    const sum = params.alpha + params.beta;
    return (params.alpha * params.beta) / (sum * sum * (sum + 1));
  }

  public computeCredibleInterval95(params: BetaDistributionParameters): readonly [number, number] {
    const mean = this.computeMean(params);
    const stdDev = Math.sqrt(this.computeVariance(params));
    const lower = Math.max(0, mean - 1.96 * stdDev);
    const upper = Math.min(1, mean + 1.96 * stdDev);
    return [Math.round(lower * 10000) / 10000, Math.round(upper * 10000) / 10000];
  }

  public updateBelief(
    marketId: string,
    prior: BetaDistributionParameters,
    observations: readonly PollingObservation[]
  ): BayesianBeliefState {
    let effectiveSuccesses = 0;
    let effectiveFailures = 0;

    for (const obs of observations) {
      const weight = obs.pollsterCredibilityWeight ?? 1.0;
      const decay = obs.daysAgo !== undefined ? Math.exp(-0.05 * obs.daysAgo) : 1.0;
      const effectiveN = obs.sampleSize * weight * decay;

      const successes = effectiveN * obs.observedShare;
      const failures = effectiveN * (1 - obs.observedShare);

      effectiveSuccesses += successes;
      effectiveFailures += failures;
    }

    const posterior: BetaDistributionParameters = {
      alpha: Math.round((prior.alpha + effectiveSuccesses) * 100) / 100,
      beta: Math.round((prior.beta + effectiveFailures) * 100) / 100,
    };

    const priorMean = Math.round(this.computeMean(prior) * 10000) / 10000;
    const posteriorMean = Math.round(this.computeMean(posterior) * 10000) / 10000;
    const posteriorVariance = Math.round(this.computeVariance(posterior) * 1000000) / 1000000;
    const credibleInterval95 = this.computeCredibleInterval95(posterior);
    const totalEffectiveSampleSize = Math.round((effectiveSuccesses + effectiveFailures) * 10) / 10;

    return {
      marketId,
      prior,
      posterior,
      priorMean,
      posteriorMean,
      posteriorVariance,
      credibleInterval95,
      totalEffectiveSampleSize,
    };
  }
}
