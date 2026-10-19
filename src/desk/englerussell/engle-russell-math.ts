/**
 * Engle-Russell (1998) ACD Pure Mathematical Functions
 *
 * Implements Lanczos log-gamma, conditional duration recursion,
 * Exponential/Weibull ACD log-likelihood, and Ljung-Box Q-statistic.
 *
 * @module desk/englerussell/engle-russell-math
 */

import type { AcdDistribution } from './engle-russell-types';

/** Compute log-gamma approximation via Lanczos formula */
export function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5209681287042,
    -1259.139216722289,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095856205,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Compute conditional duration series psi given parameters */
export function computeConditionalDurations(
  durations: number[],
  omega: number,
  alpha: number,
  beta: number,
): number[] {
  const n = durations.length;
  const psi: number[] = new Array(n);
  const sampleMean = durations.reduce((s, x) => s + x, 0) / Math.max(1, n);

  const unconditional = omega / Math.max(0.001, 1 - (alpha + beta));
  psi[0] = isFinite(unconditional) && unconditional > 0 ? unconditional : sampleMean;

  for (let i = 1; i < n; i++) {
    psi[i] = omega + alpha * durations[i - 1] + beta * psi[i - 1];
    if (psi[i] <= 1e-6) psi[i] = 1e-6;
  }
  return psi;
}

/** Compute Log-Likelihood for ACD(1,1) under Exponential / Weibull */
export function computeAcdLogLikelihood(
  durations: number[],
  omega: number,
  alpha: number,
  beta: number,
  distribution: AcdDistribution,
  shapeGamma = 1.0,
): number {
  const n = durations.length;
  if (n === 0) return -Infinity;
  const psi = computeConditionalDurations(durations, omega, alpha, beta);

  let ll = 0;
  if (distribution === 'exponential') {
    for (let i = 0; i < n; i++) {
      const x = durations[i];
      const p = psi[i];
      ll += -Math.log(p) - x / p;
    }
  } else {
    const constTerm = Math.exp(logGamma(1 + 1 / shapeGamma));
    for (let i = 0; i < n; i++) {
      const x = durations[i];
      const p = psi[i];
      const z = (x * constTerm) / p;
      ll += Math.log(shapeGamma / x) + shapeGamma * Math.log(z) - Math.pow(z, shapeGamma);
    }
  }

  return isFinite(ll) ? ll : -1e9;
}

/** Ljung-Box Q-statistic on standardized residuals eps_i = x_i / psi_i */
export function computeLjungBoxQ(durations: number[], psi: number[], maxLag = 5): number {
  const n = durations.length;
  if (n <= maxLag) return 0;

  const eps = durations.map((x, i) => x / Math.max(1e-6, psi[i]));
  const meanEps = eps.reduce((s, e) => s + e, 0) / n;
  const variance = eps.reduce((s, e) => s + (e - meanEps) ** 2, 0) / n;

  if (variance <= 1e-8) return 0;

  let qStat = 0;
  for (let k = 1; k <= maxLag; k++) {
    let autoCov = 0;
    for (let i = k; i < n; i++) {
      autoCov += (eps[i] - meanEps) * (eps[i - k] - meanEps);
    }
    const rk = autoCov / (n * variance);
    qStat += (rk * rk) / (n - k);
  }
  return n * (n + 2) * qStat;
}
