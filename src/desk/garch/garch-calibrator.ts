/**
 * GARCH & GJR-GARCH QMLE Numerical Calibrator.
 * Quasi-Maximum Likelihood Optimization under Stationarity Constraints.
 * Strictly < 180 LOC, zero :any types.
 */

import { GarchFitResult, GarchModelType, GjrGarchParams } from './garch-types';
import {
  calculateAicBic,
  calculateLogLikelihood,
  calculatePersistence,
  calculateUnconditionalVariance,
  calculateVariancesAndResiduals,
} from './garch-math';

export function calibrateGarch(
  returns: readonly number[],
  modelType: GarchModelType = 'STANDARD_GARCH'
): GarchFitResult {
  const n = returns.length;
  if (n < 5) {
    throw new Error(`Insufficient returns series length: ${n} < 5`);
  }

  // Sample mean and variance
  let sum = 0.0;
  for (let i = 0; i < n; i++) sum += returns[i];
  const mu = sum / n;

  let sumSq = 0.0;
  for (let i = 0; i < n; i++) sumSq += (returns[i] - mu) * (returns[i] - mu);
  const sampleVar = sumSq / (n - 1);

  const isGjr = modelType === 'GJR_GARCH';

  // Candidate grid points for initialization
  const alphaCandidates = [0.03, 0.05, 0.08, 0.12];
  const betaCandidates = [0.80, 0.85, 0.88, 0.92];
  const gammaCandidates = isGjr ? [0.02, 0.05, 0.08, 0.12] : [0.0];

  let bestParams: GjrGarchParams = {
    omega: sampleVar * 0.05,
    alpha: 0.05,
    beta: 0.90,
    gamma: isGjr ? 0.05 : 0.0,
    mu,
  };
  let bestLL = -1e12;

  // Grid search for robust initialization
  for (const a of alphaCandidates) {
    for (const b of betaCandidates) {
      for (const g of gammaCandidates) {
        const persist = a + 0.5 * g + b;
        if (persist >= 0.995) continue;
        const w = sampleVar * (1.0 - persist);
        if (w <= 1e-9) continue;

        const candidate: GjrGarchParams = { omega: w, alpha: a, beta: b, gamma: g, mu };
        const ll = calculateLogLikelihood(returns, candidate);
        if (ll > bestLL) {
          bestLL = ll;
          bestParams = candidate;
        }
      }
    }
  }

  // Local coordinate refinement
  const step = 0.01;
  for (let iter = 0; iter < 12; iter++) {
    const scales = [
      { key: 'alpha', delta: step },
      { key: 'beta', delta: step },
      ...(isGjr ? [{ key: 'gamma', delta: step }] : []),
    ];

    for (const { key, delta } of scales) {
      for (const direction of [-1, 1]) {
        let trialAlpha = bestParams.alpha;
        let trialBeta = bestParams.beta;
        let trialGamma = bestParams.gamma;

        if (key === 'alpha') trialAlpha += direction * delta;
        if (key === 'beta') trialBeta += direction * delta;
        if (key === 'gamma') trialGamma += direction * delta;

        if (trialAlpha < 0.005 || trialBeta < 0.005 || trialGamma < 0) continue;

        const persist = isGjr ? trialAlpha + trialBeta + 0.5 * trialGamma : trialAlpha + trialBeta;
        if (persist >= 0.995) continue;
        const trialOmega = sampleVar * (1.0 - persist);

        const trial: GjrGarchParams = {
          omega: trialOmega,
          alpha: trialAlpha,
          beta: trialBeta,
          gamma: trialGamma,
        };

        const ll = calculateLogLikelihood(returns, trial);
        if (ll > bestLL) {
          bestLL = ll;
          bestParams = trial;
        }
      }
    }
  }

  const { variances, residuals } = calculateVariancesAndResiduals(returns, bestParams);
  const persistence = calculatePersistence(bestParams);
  const unconditionalVariance = calculateUnconditionalVariance(bestParams);
  const annualizedLongRunVol = Math.sqrt(Math.max(0, unconditionalVariance) * 252);
  const numParams = isGjr ? 4 : 3;
  const { aic, bic } = calculateAicBic(bestLL, numParams, n);

  return {
    modelType,
    params: bestParams,
    logLikelihood: bestLL,
    aic,
    bic,
    persistence,
    unconditionalVariance,
    annualizedLongRunVol,
    isStationary: persistence < 1.0,
    conditionalVariances: variances,
    residuals,
  };
}
