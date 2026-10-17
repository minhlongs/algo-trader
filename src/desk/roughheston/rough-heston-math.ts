/**
 * Pure mathematical functions for Jaisson & Rosenbaum (2015, 2016) Rough Heston Limit.
 *
 * Implements fractional kernel evaluation, gamma function approximation,
 * Hurst scaling, and rough Volterra integral trajectory calculation.
 *
 * Strictly < 120 LOC, zero :any.
 */

import { RoughHestonConfig, RoughVolatilityTrajectory } from './rough-heston-types';

export function gammaLanczos(z: number): number {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaLanczos(1 - z));
  }
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109583659912,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const g = 7;
  const x = z - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) {
    a += p[i] / (x + i + 1);
  }
  const t = x + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

export function computeHurstParameter(alpha: number): number {
  const boundedAlpha = Math.max(0.51, Math.min(0.99, alpha));
  return Math.round((boundedAlpha - 0.5) * 1000) / 1000;
}

export function computeFractionalKernel(alpha: number, steps: number, dt: number): number[] {
  const kernel: number[] = [];
  const gammaAlpha = gammaLanczos(alpha);

  for (let k = 1; k <= steps; k++) {
    const t = k * dt;
    const val = Math.pow(t, alpha - 1.0) / gammaAlpha;
    kernel.push(val);
  }
  return kernel;
}

export function simulateDeterministicRoughTrajectory(
  config: RoughHestonConfig,
  initialVariance: number,
  steps: number,
  dt: number
): RoughVolatilityTrajectory {
  const kernel = computeFractionalKernel(config.alpha, steps, dt);
  const variances: number[] = [initialVariance];
  const times: number[] = [0];
  let integratedVariance = 0.0;

  for (let i = 1; i <= steps; i++) {
    times.push(Math.round(i * dt * 1000) / 1000);

    // Convolve fractional kernel with mean reversion drift: lambda * (theta - V_s)
    let driftAcc = 0.0;
    for (let j = 0; j < i; j++) {
      const lagIdx = i - 1 - j;
      const kVal = kernel[lagIdx] ?? 0.0;
      const v_j = variances[j] ?? initialVariance;
      const drift = config.meanReversion * (config.theta - v_j);
      driftAcc += kVal * drift * dt;
    }

    const nextV = Math.max(1e-6, initialVariance + driftAcc);
    variances.push(nextV);
    integratedVariance += nextV * dt;
  }

  return {
    times,
    variances: variances.map((v) => Math.round(v * 1e6) / 1e6),
    integratedVariance: Math.round(integratedVariance * 1e6) / 1e6,
  };
}
