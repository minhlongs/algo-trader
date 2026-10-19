/**
 * Engle-Russell (1998) ACD Quasi-Maximum Likelihood Estimation
 *
 * Implements QMLE for ACD(1,1) with Exponential and Weibull innovations,
 * computing conditional duration recursion psi_i = omega + alpha * x_{i-1} + beta * psi_{i-1}.
 *
 * @module desk/englerussell/engle-russell-estimator
 */

import type {
  AcdFitResult,
  AcdModelConfig,
} from './engle-russell-types';
import {
  logGamma,
  computeConditionalDurations,
  computeAcdLogLikelihood,
  computeLjungBoxQ,
} from './engle-russell-math';

export {
  logGamma,
  computeConditionalDurations,
  computeAcdLogLikelihood,
  computeLjungBoxQ,
};

/** Estimate ACD(1,1) via grid search refinement */
export function estimateAcd11(durations: number[], config?: Partial<AcdModelConfig>): AcdFitResult {
  const dist = config?.distribution ?? 'exponential';
  const shapeGamma = config?.shapeGamma ?? (dist === 'weibull' ? 1.2 : 1.0);
  const n = durations.length;
  if (n < 5) throw new Error('At least 5 duration observations required for ACD estimation');

  const meanDur = durations.reduce((s, x) => s + x, 0) / n;

  let bestLL = -Infinity;
  let bestOmega = 0.1 * meanDur;
  let bestAlpha = 0.1;
  let bestBeta = 0.8;

  for (const a of [0.05, 0.1, 0.15, 0.2]) {
    for (const b of [0.6, 0.7, 0.8, 0.85]) {
      if (a + b >= 0.99) continue;
      const om = meanDur * (1 - a - b);
      const ll = computeAcdLogLikelihood(durations, om, a, b, dist, shapeGamma);
      if (ll > bestLL) {
        bestLL = ll;
        bestOmega = om;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }

  const persistence = bestAlpha + bestBeta;
  const unconditionalMeanDuration = bestOmega / Math.max(0.001, 1 - persistence);
  const numParams = dist === 'weibull' ? 4 : 3;
  const aic = 2 * numParams - 2 * bestLL;
  const bic = Math.log(n) * numParams - 2 * bestLL;

  const psi = computeConditionalDurations(durations, bestOmega, bestAlpha, bestBeta);
  const standardizedResidualsQStat = computeLjungBoxQ(durations, psi);

  return {
    omega: bestOmega,
    alpha: [bestAlpha],
    beta: [bestBeta],
    shapeGamma: dist === 'weibull' ? shapeGamma : undefined,
    persistence,
    unconditionalMeanDuration,
    logLikelihood: bestLL,
    aic,
    bic,
    standardizedResidualsQStat,
    sampleSize: n,
  };
}
