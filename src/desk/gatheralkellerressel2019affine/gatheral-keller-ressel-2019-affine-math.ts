/**
 * Wave 300 — Gatheral & Keller-Ressel (2019): Affine Forward Variance Models
 * Computes affine forward variance curve xi_0(T) and integrated variance swap strike.
 */
import type {
  GatheralKellerRessel2019AffineConfig,
  GatheralKellerRessel2019AffineResult,
} from './types';

export function computeGatheralKellerRessel2019Affine(
  cfg: GatheralKellerRessel2019AffineConfig,
): GatheralKellerRessel2019AffineResult {
  const {
    spotVarianceV0: v0,
    longRunVarianceTheta: theta,
    meanReversionLambda: lambda,
    hurstExponentH: H,
    volOfVolNu: nu,
    maturityT: T,
  } = cfg;

  if (v0 <= 0 || theta <= 0 || lambda <= 0 || H <= 0 || H >= 0.5 || nu <= 0 || T <= 0) {
    throw new Error('Invalid GatheralKellerRessel2019AffineConfig: H must be in (0, 0.5)');
  }

  const alpha = H + 0.5;
  const mittagDecay = 1 / (1 + lambda * Math.pow(T, alpha));
  const forwardVar = theta + (v0 - theta) * mittagDecay;
  const steps = 16;
  const dt = T / steps;
  let integratedVar = 0;
  for (let i = 1; i <= steps; i++) {
    const u = (i - 0.5) * dt;
    const xiU = theta + (v0 - theta) / (1 + lambda * Math.pow(u, alpha));
    integratedVar += xiU * dt;
  }
  const fairStrike = Math.sqrt(integratedVar / T);

  return {
    roughAlphaExponent: alpha,
    forwardVarianceAtMaturity: forwardVar,
    integratedForwardVariance: integratedVar,
    affineVarianceSwapFairStrike: fairStrike,
    isAffineAdmissible: forwardVar > 0 && integratedVar > 0,
  };
}
