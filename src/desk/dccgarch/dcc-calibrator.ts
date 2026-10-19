/**
 * Calibration routine for Engle (2002) DCC-GARCH via two-step QMLE.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  computeDccLogLikelihood2D,
  computeUnconditionalCorrelation,
  evaluateDccSeries,
} from './dcc-math';
import { DccFitResult, DccParams } from './dcc-types';

export function calibrateDcc(
  standardizedResiduals: readonly (readonly number[])[],
  volatilities: readonly (readonly number[])[],
  initParams?: Partial<DccParams>
): DccFitResult {
  const tCount = standardizedResiduals.length;
  if (tCount < 5) {
    throw new Error('DCC calibration requires at least 5 multivariate observations');
  }

  const qBar = computeUnconditionalCorrelation(standardizedResiduals);

  let bestParams: DccParams = {
    alpha: initParams?.alpha ?? 0.05,
    beta: initParams?.beta ?? 0.88,
  };

  let bestSeries = evaluateDccSeries(
    standardizedResiduals,
    volatilities,
    bestParams,
    qBar
  );
  let bestLl = computeDccLogLikelihood2D(standardizedResiduals, bestSeries);

  // Search over realistic DCC parameter bounds
  const alphaCandidates = [0.01, 0.03, 0.05, 0.08, 0.12];
  const betaCandidates = [0.80, 0.85, 0.88, 0.90, 0.94];

  for (const a of alphaCandidates) {
    for (const b of betaCandidates) {
      if (a + b >= 0.99) continue;
      const cand: DccParams = { alpha: a, beta: b };
      const candSeries = evaluateDccSeries(
        standardizedResiduals,
        volatilities,
        cand,
        qBar
      );
      const candLl = computeDccLogLikelihood2D(standardizedResiduals, candSeries);
      if (candLl > bestLl) {
        bestLl = candLl;
        bestParams = cand;
        bestSeries = candSeries;
      }
    }
  }

  // Refine locally
  const step = 0.01;
  for (let iter = 0; iter < 10; iter++) {
    const localCands: DccParams[] = [
      { alpha: Math.max(0.005, bestParams.alpha + step), beta: bestParams.beta },
      { alpha: Math.max(0.005, bestParams.alpha - step), beta: bestParams.beta },
      { alpha: bestParams.alpha, beta: Math.min(0.98, bestParams.beta + step) },
      { alpha: bestParams.alpha, beta: Math.max(0.50, bestParams.beta - step) },
    ];
    let improved = false;
    for (const cand of localCands) {
      if (cand.alpha + cand.beta >= 0.999) continue;
      const candSeries = evaluateDccSeries(
        standardizedResiduals,
        volatilities,
        cand,
        qBar
      );
      const candLl = computeDccLogLikelihood2D(standardizedResiduals, candSeries);
      if (candLl > bestLl + 1e-4) {
        bestLl = candLl;
        bestParams = cand;
        bestSeries = candSeries;
        improved = true;
      }
    }
    if (!improved) break;
  }

  let sumRho12 = 0;
  for (const pt of bestSeries) {
    sumRho12 += pt.correlationMatrix[0][1];
  }
  const averageCorrelation12 = sumRho12 / bestSeries.length;

  return {
    params: bestParams,
    unconditionalCorrelation: qBar,
    logLikelihood: bestLl,
    persistence: bestParams.alpha + bestParams.beta,
    series: bestSeries,
    averageCorrelation12,
  };
}
