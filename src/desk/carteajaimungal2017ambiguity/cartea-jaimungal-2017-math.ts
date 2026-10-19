/**
 * Wave 266: Cartea & Jaimungal (2017) Ambiguity-Averse Market Making Math.
 * Closed-form bid-ask quotes under relative entropy Knightian uncertainty.
 * Strictly < 85 LOC, zero :any.
 */

import { AmbiguityMarketMakingConfig, AmbiguityMarketMakingResult } from './types';

export function computeAmbiguityMarketMakingQuotes(cfg: AmbiguityMarketMakingConfig): AmbiguityMarketMakingResult {
  const { riskAversionGamma: gamma, ambiguityPenaltyTheta: theta, orderArrivalKappa: kappa, assetVolatilitySigma: sigma, inventory: q } = cfg;

  if (gamma <= 0 || theta <= 0 || kappa <= 0 || sigma <= 0) {
    throw new Error('All model parameters must be strictly positive');
  }

  // Baseline classical Avellaneda-Stoikov / Cartea-Jaimungal spread without ambiguity
  const neutralSpread = (2 / gamma) * Math.log(1 + gamma / kappa);
  const neutralSkew = ((2 * q - 1) * gamma * (sigma * sigma)) / (2 * kappa);
  const neutralBid = Math.max(0.0001, 0.5 * neutralSpread + neutralSkew);
  const neutralAsk = Math.max(0.0001, 0.5 * neutralSpread - neutralSkew);

  // Ambiguity penalty adjustment under worst-case drift:
  // delta_adj = (1 / theta) * log(1 + (theta * |q| * sigma^2) / (2 * kappa))
  const worstCaseTerm = (theta * Math.abs(q) * (sigma * sigma)) / (2 * kappa);
  const worstCaseDriftAdjustment = (1 / theta) * Math.log(1 + worstCaseTerm);

  // When long (q > 0), the worst-case measure exerts downward drift:
  // widen bid (reluctance to buy more), lower ask (eager to unload)
  const optimalBid = neutralBid + worstCaseDriftAdjustment * (q >= 0 ? 1 : -0.5);
  const optimalAsk = neutralAsk + worstCaseDriftAdjustment * (q <= 0 ? 1 : -0.5);

  return {
    optimalBidSpread: Math.max(0.0001, optimalBid),
    optimalAskSpread: Math.max(0.0001, optimalAsk),
    neutralBidSpread: neutralBid,
    neutralAskSpread: neutralAsk,
    totalSpread: Math.max(0.0001, optimalBid) + Math.max(0.0001, optimalAsk),
    worstCaseDriftAdjustment,
  };
}
