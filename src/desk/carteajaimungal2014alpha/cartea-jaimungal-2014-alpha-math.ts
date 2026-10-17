import { CarteaJaimungal2014AlphaConfig, CarteaJaimungal2014AlphaQuotes } from './types';

/**
 * Wave 260: Cartea, Jaimungal & Ricci (2014) Alpha-Informed Market Making Math.
 * Strictly < 80 LOC, zero :any.
 */
export function computeReservationPrice(
  midPrice: number,
  inventoryQ: number,
  alphaDrift: number,
  gamma: number,
  sigma: number,
  kappa: number,
  tau = 1.0
): number {
  const gammaSigmaSq = gamma * sigma * sigma;
  const invPenalty = inventoryQ * gammaSigmaSq * tau;
  let alphaAdjustment = alphaDrift * tau;

  if (gammaSigmaSq > 1e-12 && kappa > 0) {
    alphaAdjustment = (alphaDrift / gammaSigmaSq) * (1 - Math.exp(-kappa * tau));
  } else if (kappa > 0) {
    alphaAdjustment = (alphaDrift / kappa) * (1 - Math.exp(-kappa * tau));
  }

  return midPrice - invPenalty + alphaAdjustment;
}

export function computeCarteaJaimungalAlphaQuotes(
  config: CarteaJaimungal2014AlphaConfig
): CarteaJaimungal2014AlphaQuotes {
  const { midPrice, inventoryQ, alphaDrift, riskAversionGamma, volatilitySigma, fillIntensityA } = config;
  const kappa = Math.max(1e-4, config.fillDecayK);
  const tau = config.timeRemainingTau ?? 1.0;
  const gamma = Math.max(1e-6, riskAversionGamma);

  const delta0 = config.baseSpreadDelta0 ?? (1 / kappa) * Math.log(1 + kappa / gamma);
  const alphaSkewAdjustment = alphaDrift / kappa;
  const halfInvVar = (gamma * volatilitySigma * volatilitySigma) / 2;

  const optimalBidSpread = delta0 - alphaSkewAdjustment + halfInvVar * (2 * inventoryQ + 1);
  const optimalAskSpread = delta0 + alphaSkewAdjustment - halfInvVar * (2 * inventoryQ - 1);

  const optimalBidPrice = midPrice - optimalBidSpread;
  const optimalAskPrice = midPrice + optimalAskSpread;

  const fillIntensityBid = fillIntensityA * Math.exp(-kappa * Math.max(0, optimalBidSpread));
  const fillIntensityAsk = fillIntensityA * Math.exp(-kappa * Math.max(0, optimalAskSpread));

  const reservationPrice = computeReservationPrice(
    midPrice,
    inventoryQ,
    alphaDrift,
    gamma,
    volatilitySigma,
    kappa,
    tau
  );

  return {
    reservationPrice,
    optimalBidSpread,
    optimalAskSpread,
    optimalBidPrice,
    optimalAskPrice,
    fillIntensityBid,
    fillIntensityAsk,
    totalSpread: optimalBidSpread + optimalAskSpread,
    alphaSkewAdjustment,
  };
}
