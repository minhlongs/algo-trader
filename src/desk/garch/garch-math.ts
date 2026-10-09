/**
 * GARCH & GJR-GARCH Mathematical Engine.
 * Recursive conditional variance paths and Gaussian quasi-log-likelihood.
 * Strictly < 180 LOC, zero :any types.
 */

import { GjrGarchParams } from './garch-types';

export function calculatePersistence(params: GjrGarchParams): number {
  return params.alpha + 0.5 * params.gamma + params.beta;
}

export function calculateUnconditionalVariance(params: GjrGarchParams): number {
  const persistence = calculatePersistence(params);
  if (persistence >= 1.0 - 1e-6) {
    return Infinity;
  }
  return params.omega / (1.0 - persistence);
}

export function calculateVariancesAndResiduals(
  returns: readonly number[],
  params: GjrGarchParams
): { variances: number[]; residuals: number[] } {
  const n = returns.length;
  if (n === 0) {
    return { variances: [], residuals: [] };
  }

  const mu = params.mu ?? 0.0;
  const residuals = returns.map((r) => r - mu);

  // Sample variance as initial value for sigma_0^2
  let sampleVar = 0.0;
  for (let i = 0; i < n; i++) {
    sampleVar += residuals[i] * residuals[i];
  }
  sampleVar = n > 1 ? sampleVar / (n - 1) : 1e-4;

  const longRun = calculateUnconditionalVariance(params);
  const initialVar = Number.isFinite(longRun) && longRun > 0 ? longRun : sampleVar;

  const variances = new Array<number>(n);
  let prevVar = Math.max(1e-8, initialVar);

  for (let t = 0; t < n; t++) {
    const prevEps = t > 0 ? residuals[t - 1] : 0.0;
    const isNegative = prevEps < 0 ? 1.0 : 0.0;

    let sigma2: number;
    if (t === 0) {
      sigma2 = prevVar;
    } else {
      // GJR-GARCH conditional variance recursion:
      // sigma_t^2 = omega + (alpha + gamma * I_{eps_{t-1} < 0}) * eps_{t-1}^2 + beta * sigma_{t-1}^2
      sigma2 =
        params.omega +
        (params.alpha + params.gamma * isNegative) * prevEps * prevEps +
        params.beta * prevVar;
    }

    sigma2 = Math.max(1e-8, sigma2);
    variances[t] = sigma2;
    prevVar = sigma2;
  }

  return { variances, residuals };
}

export function calculateLogLikelihood(
  returns: readonly number[],
  params: GjrGarchParams
): number {
  const persistence = calculatePersistence(params);
  if (
    params.omega <= 0 ||
    params.alpha < 0 ||
    params.beta < 0 ||
    params.gamma < 0 ||
    persistence >= 1.0
  ) {
    return -1e12; // Penalty for non-stationary or non-positive constraints
  }

  const { variances, residuals } = calculateVariancesAndResiduals(returns, params);
  const n = returns.length;
  if (n === 0) return 0;

  let ll = 0.0;
  const log2Pi = Math.log(2.0 * Math.PI);

  for (let t = 0; t < n; t++) {
    const s2 = variances[t];
    const e2 = residuals[t] * residuals[t];
    ll += -0.5 * (log2Pi + Math.log(s2) + e2 / s2);
  }

  return Number.isFinite(ll) ? ll : -1e12;
}

export function calculateAicBic(
  logLikelihood: number,
  numParams: number,
  sampleSize: number
): { aic: number; bic: number } {
  const k = numParams;
  const n = Math.max(1, sampleSize);
  const aic = 2 * k - 2 * logLikelihood;
  const bic = k * Math.log(n) - 2 * logLikelihood;
  return { aic, bic };
}
