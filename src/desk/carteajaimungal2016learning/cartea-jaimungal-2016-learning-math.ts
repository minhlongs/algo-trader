/**
 * Wave 287 — Cartea, Jaimungal & Kinzebulatov (2016): Algorithmic Trading with Learning
 * Computes Kalman-Bucy posterior drift mean/variance and ambiguity-penalized optimal execution speed.
 */
import type {
  Cartea2016LearningConfig,
  Cartea2016LearningResult,
} from './types';

export function computeCartea2016LearningExecution(
  cfg: Cartea2016LearningConfig,
): Cartea2016LearningResult {
  const {
    priorDriftMeanMu0: mu0,
    priorDriftVarianceV0: v0,
    assetVolatilitySigma: sigma,
    observedPriceChangeDeltaS: dS,
    elapsedTimeSec: t,
    remainingTimeSec: tau,
    currentInventoryQ: q,
    temporaryImpactEta: eta,
    ambiguityAversionPhi: phi,
  } = cfg;

  if (v0 <= 0 || sigma <= 0 || t < 0 || tau <= 0 || q < 0 || eta <= 0 || phi <= 0) {
    throw new Error('Invalid Cartea2016LearningConfig: parameters outside valid positive domain');
  }

  const sigma2 = sigma * sigma;
  const denom = sigma2 + v0 * t;
  const posteriorMean = (sigma2 * mu0 + v0 * dS) / denom;
  const posteriorVar = (sigma2 * v0) / denom;
  const varRatio = posteriorVar / v0;

  const effectivePenalty = phi + 0.5 * posteriorVar;
  const gamma = Math.sqrt(effectivePenalty / eta);
  const coth = Math.cosh(gamma * tau) / Math.max(1e-8, Math.sinh(gamma * tau));
  const baseRate = gamma * coth * q;
  const driftOffset = -posteriorMean / (2 * eta * (1 + gamma * tau));
  const optimalRate = Math.max(0, baseRate + driftOffset);

  return {
    posteriorDriftMean: posteriorMean,
    posteriorDriftVariance: posteriorVar,
    varianceReductionRatio: varRatio,
    learningAdjustedExecutionRate: optimalRate,
  };
}
