/**
 * Wave 297 — Bouchaud, Gefen, Potters & Wyart (2004): Fluctuations and Response in Financial Markets
 * Computes critical propagator decay exponent beta* = (1 - gamma) / 2 and lag kernel.
 */
import type {
  Bouchaud2004PropagatorConfig,
  Bouchaud2004PropagatorResult,
} from './types';

export function computeBouchaud2004Propagator(
  cfg: Bouchaud2004PropagatorConfig,
): Bouchaud2004PropagatorResult {
  const {
    signAutocorrelationGamma: gamma,
    bareImpactScaleG0: g0,
    evaluationLagSteps: lag,
    unconditionalSignVariance: s2,
  } = cfg;

  if (gamma <= 0 || gamma >= 1 || g0 <= 0 || lag < 1 || s2 <= 0) {
    throw new Error('Invalid Bouchaud2004PropagatorConfig: gamma must be in (0, 1)');
  }

  const betaStar = (1 - gamma) / 2;
  const kernelAtLag = g0 * Math.pow(lag, -betaStar);
  const corrAtLag = Math.pow(lag, -gamma);
  const diffusiveVar = g0 * g0 * s2;

  return {
    criticalPropagatorBeta: betaStar,
    propagatorKernelAtLag: kernelAtLag,
    signCorrelationAtLag: corrAtLag,
    singleStepDiffusiveVariance: diffusiveVar,
    isPurelyDiffusiveRegime: Math.abs(2 * betaStar + gamma - 1) < 1e-12,
  };
}
