/**
 * Wave 290 — Cartea, Donnelly & Jaimungal (2017): Algorithmic Trading with Model Uncertainty
 * Computes ambiguity-averse execution velocity and worst-case drift perturbation.
 */
import type {
  CarteaDonnellyJaimungal2017Config,
  CarteaDonnellyJaimungal2017Result,
} from './types';

export function computeCarteaDonnellyJaimungal2017Uncertainty(
  cfg: CarteaDonnellyJaimungal2017Config,
): CarteaDonnellyJaimungal2017Result {
  const {
    currentInventoryQ: q,
    remainingHorizonSec: tau,
    volatilitySigma: sigma,
    temporaryImpactEta: eta,
    inventoryPenaltyPhiInv: phiInv,
    driftAmbiguityPenaltyPhiDrift: phiDrift,
  } = cfg;

  if (q <= 0 || tau <= 0 || sigma <= 0 || eta <= 0 || phiInv <= 0 || phiDrift < 0) {
    throw new Error('Invalid CarteaDonnellyJaimungal2017Config: invalid parameter values');
  }

  const kappaNeutral = Math.sqrt(phiInv / eta);
  const effectivePenalty = phiInv + 0.5 * phiDrift * sigma * sigma;
  const kappaRobust = Math.sqrt(effectivePenalty / eta);

  const baselineNeutralRate = (kappaNeutral * q) / Math.tanh(kappaNeutral * tau);
  const robustAmbiguityRate = (kappaRobust * q) / Math.tanh(kappaRobust * tau);
  const worstCaseDriftAdjustment = -phiDrift * sigma * sigma * q;

  return {
    effectiveUrgencyKappa: kappaRobust,
    baselineNeutralRate,
    robustAmbiguityRate,
    worstCaseDriftAdjustment,
    urgencyAccelerationRatio: robustAmbiguityRate / baselineNeutralRate,
  };
}
