/**
 * Wave 245: Cartea & Jaimungal (2014) Optimal Market Making with Alpha Predictor Math
 * Strictly < 85 LOC, zero mocks, closed-form asymptotic solutions.
 */

import { CarteaAlphaMmConfig, CarteaAlphaQuotes } from './cartea-alpha-types';

export function computeCarteaAlphaQuotes(config: CarteaAlphaMmConfig): CarteaAlphaQuotes {
  const {
    inventoryQ,
    riskAversionGamma,
    fillProbabilityKappa,
    shortTermAlphaAlpha,
  } = config;

  // Symmetric baseline spread: 2 / kappa + gamma / kappa^2
  const baselineHalfSpread = 1.0 / fillProbabilityKappa + (0.5 * riskAversionGamma) / (fillProbabilityKappa * fillProbabilityKappa);

  // Reservation price skew from inventory: - (2q + 1) * gamma / (2 * kappa)
  const inventorySkewBid = -((2 * inventoryQ + 1) * riskAversionGamma) / (2.0 * fillProbabilityKappa);
  const inventorySkewAsk = ((2 * inventoryQ - 1) * riskAversionGamma) / (2.0 * fillProbabilityKappa);

  // Alpha predictor adjustment: shifting quotes in direction of anticipated drift alpha
  // If alpha > 0 (bullish), bid moves up (spread delta minus decreases), ask moves up (spread delta plus increases)
  const alphaAdjustmentBid = -shortTermAlphaAlpha / fillProbabilityKappa;
  const alphaAdjustmentAsk = shortTermAlphaAlpha / fillProbabilityKappa;

  const bidHalfSpread = Math.max(0.0001, baselineHalfSpread + inventorySkewBid + alphaAdjustmentBid);
  const askHalfSpread = Math.max(0.0001, baselineHalfSpread + inventorySkewAsk + alphaAdjustmentAsk);

  const totalSpread = bidHalfSpread + askHalfSpread;
  const effectiveReservationSkew = (askHalfSpread - bidHalfSpread) / 2.0;

  return {
    bidHalfSpreadDeltaMinus: bidHalfSpread,
    askHalfSpreadDeltaPlus: askHalfSpread,
    effectiveReservationSkew,
    totalOptimalSpread: totalSpread,
    targetInventorySkewBias: -inventoryQ * riskAversionGamma,
  };
}
