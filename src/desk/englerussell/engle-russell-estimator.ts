/**
 * Engle-Russell (1998) ACD Quasi-Maximum Likelihood Estimation
 *
 * Implements QMLE for ACD(1,1) with Exponential and Weibull innovations,
 * computing conditional duration recursion psi_i = omega + alpha * x_{i-1} + beta * psi_{i-1}.
 *
 * @module desk/englerussell/engle-russell-estimator
 */

import type {
  AcdDistribution,
  AcdFitResult,
  AcdModelConfig,
} from './engle-russell-types';

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
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
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

  // Initialize psi_0 with unconditional mean or sample mean
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
    // Weibull distribution: f(x) = gamma/x * (x * Gamma(1 + 1/gamma) / psi)^gamma * exp(-...)
    const lg = logGamma(1 + 1 / shapeGamma);
    const constTerm = Math.exp(lg);
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

  // Initial parameter candidates
  const alphaCandidates = [0.05, 0.1, 0.15, 0.2];
  const betaCandidates = [0.6, 0.7, 0.8, 0.85];

  for (const a of alphaCandidates) {
    for (const b of betaCandidates) {
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
