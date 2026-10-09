/**
 * Calibration routine for Nelson (1991) EGARCH via QMLE.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  computeEgarchLogLikelihood,
  computeSampleVariance,
  computeUnconditionalEgarchVariance,
  evaluateEgarchSeries,
} from './egarch-math';
import { EgarchFitResult, EgarchParams } from './egarch-types';

export function calibrateEgarch(
  returns: readonly number[],
  initParams?: Partial<EgarchParams>
): EgarchFitResult {
  if (returns.length < 5) {
    throw new Error('EGARCH calibration requires at least 5 return observations');
  }

  const sampleVar = computeSampleVariance(returns);
  const sampleLogVar = Math.log(sampleVar);

  let bestParams: EgarchParams = {
    omega: initParams?.omega ?? -0.2,
    alpha: initParams?.alpha ?? 0.15,
    gamma: initParams?.gamma ?? -0.08, // negative leverage effect default
    beta: initParams?.beta ?? 0.90,
  };

  // Adjust omega baseline to approximate sample variance: omega ~ (1 - beta) * sampleLogVar
  bestParams = {
    ...bestParams,
    omega: bestParams.omega || (1 - bestParams.beta) * sampleLogVar,
  };

  let bestSeries = evaluateEgarchSeries(returns, bestParams);
  let bestLl = computeEgarchLogLikelihood(bestSeries);

  // Coordinate descent optimization passes
  const stepSizes = [0.1, 0.03, 0.01, 0.003];
  for (const step of stepSizes) {
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 30) {
      improved = false;
      iterations++;

      const candidates: EgarchParams[] = [
        { ...bestParams, omega: bestParams.omega + step },
        { ...bestParams, omega: bestParams.omega - step },
        { ...bestParams, alpha: Math.max(0, bestParams.alpha + step) },
        { ...bestParams, alpha: Math.max(0, bestParams.alpha - step) },
        { ...bestParams, gamma: Math.min(1, Math.max(-1, bestParams.gamma + step)) },
        { ...bestParams, gamma: Math.min(1, Math.max(-1, bestParams.gamma - step)) },
        { ...bestParams, beta: Math.min(0.999, Math.max(0.01, bestParams.beta + step)) },
        { ...bestParams, beta: Math.min(0.999, Math.max(0.01, bestParams.beta - step)) },
      ];

      for (const cand of candidates) {
        const candSeries = evaluateEgarchSeries(returns, cand);
        const candLl = computeEgarchLogLikelihood(candSeries);
        if (candLl > bestLl + 1e-6) {
          bestLl = candLl;
          bestParams = cand;
          bestSeries = candSeries;
          improved = true;
        }
      }
    }
  }

  const k = 4; // number of parameters
  const n = returns.length;
  const aic = 2 * k - 2 * bestLl;
  const bic = k * Math.log(n) - 2 * bestLl;
  const unconditionalVar = computeUnconditionalEgarchVariance(bestParams);

  return {
    params: bestParams,
    logLikelihood: bestLl,
    aic,
    bic,
    persistence: bestParams.beta,
    asymmetryIndex: bestParams.gamma,
    unconditionalVariance: unconditionalVar,
    series: bestSeries,
  };
}
