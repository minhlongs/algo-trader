/**
 * Wave 294 — Gatheral, Jaisson & Rosenbaum (2018): Rough Heston Fractional Kernel Discretization
 * Computes discrete Volterra fractional kernel weights for H in (0, 0.5).
 */
import type {
  GatheralJaisson2018HestonConfig,
  GatheralJaisson2018HestonResult,
} from './types';

function approxGammaHalfPlusH(h: number): number {
  // Lanczos/Stirling accurate positive approximation on (0.5, 1.0) for Gamma(H + 0.5)
  const z = h + 0.5;
  return Math.sqrt((2 * Math.PI) / z) * Math.pow((z + 1 / (12 * z - 0.1 / z)) / Math.E, z);
}

export function computeGatheralJaisson2018Heston(
  cfg: GatheralJaisson2018HestonConfig,
): GatheralJaisson2018HestonResult {
  const {
    hurstExponentH: H,
    horizonSec: T,
    stepsN: N,
    baselineVarianceV0: v0,
    volOfVolNu: nu,
  } = cfg;

  if (H <= 0 || H >= 0.5 || T <= 0 || N < 2 || v0 <= 0 || nu <= 0) {
    throw new Error('Invalid GatheralJaisson2018HestonConfig: H must be in (0, 0.5)');
  }

  const dt = T / N;
  const gammaVal = approxGammaHalfPlusH(H);
  const weights: number[] = [];

  for (let j = 1; j <= N; j++) {
    const tUpper = j * dt;
    const tLower = (j - 1) * dt;
    const cellIntegral =
      (Math.pow(tUpper, H + 0.5) - Math.pow(tLower, H + 0.5)) / ((H + 0.5) * gammaVal);
    weights.push(cellIntegral);
  }

  const totalMass = weights.reduce((a, b) => a + b, 0);
  const frontLagWeightShare = weights[0] / totalMass;
  const roughVarianceScalingFactor = v0 * (1 + nu * Math.pow(T, H));

  return {
    kernelWeights: weights,
    frontLagWeightShare,
    integratedKernelMass: totalMass,
    roughVarianceScalingFactor,
  };
}
