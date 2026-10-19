/**
 * Wave 237: Almgren & Lorenz (2007) Bayesian Adaptive Execution Math
 * Real-time Kalman filtering of unobserved price drift alpha_t
 * Update: Var_post^-1 = Var_prior^-1 + dt / sigma^2
 * Mean_post = Var_post * [Mean_prior / Var_prior + dS / sigma^2]
 */

import { BayesianDriftConfig, PriceObservationUpdate, BayesianStateAssessment } from './lorenz-types';

export function updateBayesianDrift(
  priorMean: number,
  priorVar: number,
  obs: PriceObservationUpdate,
  config: BayesianDriftConfig,
  remainingSharesX: number,
  remainingTimeT: number
): BayesianStateAssessment {
  const noiseVar = (config.priceVolatilitySigma * config.priceVolatilitySigma) / Math.max(obs.timeElapsedDeltaT, 1e-6);
  const kalmanGain = priorVar / (priorVar + noiseVar);

  const impliedDriftObs = obs.priceChangeDeltaS / Math.max(obs.timeElapsedDeltaT, 1e-6);
  const postMean = priorMean + kalmanGain * (impliedDriftObs - priorMean);
  const postVar = (1 - kalmanGain) * priorVar;

  // Adaptive speed: baseline TWAP speed = X / T
  // Adjusted by opportunistic drift exploitation: + postMean / (2 * eta)
  const baseRate = remainingTimeT > 0 ? remainingSharesX / remainingTimeT : remainingSharesX;
  const driftAdjustment = postMean / (2 * Math.max(config.temporaryImpactEta, 1e-6));
  const recommendedRate = Math.max(0, baseRate + driftAdjustment);

  return {
    posteriorMeanAlpha: postMean,
    posteriorVarianceSigmaSq: postVar,
    kalmanGainK: kalmanGain,
    recommendedTradingRateV: recommendedRate,
  };
}
