/**
 * Wave 302 — Cartea, Jaimungal & Penalva (2015): Algorithmic Market Making with Adverse Selection
 * Computes optimal asymmetric bid/ask offsets widened by toxic flow adverse selection.
 */
import type {
  CarteaJaimungal2015AdverseConfig,
  CarteaJaimungal2015AdverseResult,
} from './types';

export function computeCarteaJaimungal2015Adverse(
  cfg: CarteaJaimungal2015AdverseConfig,
): CarteaJaimungal2015AdverseResult {
  const {
    currentInventoryQ: q,
    maxInventoryCapQMax: qMax,
    fillDecayKappa: kappa,
    adverseSelectionCostAlpha: alphaAdv,
    runningInventoryPenaltyPhi: phi,
    volatilitySigma: sigma,
    effectiveHorizonT: T,
  } = cfg;

  if (
    qMax <= 0 ||
    Math.abs(q) > qMax ||
    kappa <= 0 ||
    alphaAdv < 0 ||
    phi <= 0 ||
    sigma <= 0 ||
    T <= 0
  ) {
    throw new Error('Invalid CarteaJaimungal2015AdverseConfig');
  }

  const baseHalfSpread = 1 / kappa + alphaAdv;
  const invRiskUnit = phi * sigma * sigma * T;
  const bidOffset = baseHalfSpread + (2 * q + 1) * 0.5 * invRiskUnit;
  const askOffset = baseHalfSpread - (2 * q - 1) * 0.5 * invRiskUnit;

  return {
    baselineHalfSpread: baseHalfSpread,
    inventorySkewIncrement: q * invRiskUnit,
    optimalBidOffset: bidOffset,
    optimalAskOffset: askOffset,
    quotedTotalSpread: bidOffset + askOffset,
  };
}
