/**
 * Wave 243: Avellaneda & Stoikov (2008) Multi-Asset Spread Quoting Engine Math
 * Closed-form analytical reservation price and bid-ask spreads for 2 correlated assets:
 * r_i(s_i, q_i, q_j) = s_i - q_i * gamma * sigma_i^2 * tau - q_j * gamma * rho * sigma_i * sigma_j * tau
 * delta_i^a + delta_i^b = gamma * sigma_i^2 * tau + (2 / gamma) * ln(1 + gamma / kappa_i)
 * Strictly < 80 LOC, zero :any.
 */

import {
  MultiAssetQuoteConfig,
  MultiAssetInventoryState,
  MultiAssetTwoSidedQuotes,
} from './avellaneda-multiasset-types';

export function computeMultiAssetQuotes(
  state: MultiAssetInventoryState,
  config: MultiAssetQuoteConfig
): MultiAssetTwoSidedQuotes {
  const tau = Math.max(1e-4, config.terminalTimeT - state.currentTimeT);
  const [S1, S2] = state.currentPrices;
  const [q1, q2] = state.currentInventories;
  const [sigma1, sigma2] = config.assetVolatilities;
  const [kappa1, kappa2] = config.orderBookLiquidityKappas;
  const gamma = Math.max(1e-4, config.riskAversionGamma);
  const rho = Math.max(-0.99, Math.min(0.99, config.assetCorrelationRho));

  // Cross-asset inventory adjustment: rho * sigma1 * sigma2 * tau * q_other
  const crossAdj1 = q2 * gamma * rho * sigma1 * sigma2 * tau;
  const crossAdj2 = q1 * gamma * rho * sigma1 * sigma2 * tau;

  // Reservation prices
  const r1 = S1 - q1 * gamma * (sigma1 ** 2) * tau - crossAdj1;
  const r2 = S2 - q2 * gamma * (sigma2 ** 2) * tau - crossAdj2;

  // Half-spreads
  const spreadTerm1 = (2 / gamma) * Math.log(1 + gamma / kappa1);
  const spreadTerm2 = (2 / gamma) * Math.log(1 + gamma / kappa2);

  const halfSpread1 = 0.5 * (gamma * (sigma1 ** 2) * tau + spreadTerm1);
  const halfSpread2 = 0.5 * (gamma * (sigma2 ** 2) * tau + spreadTerm2);

  return {
    reservationPrices: [r1, r2],
    optimalBidQuotes: [r1 - halfSpread1, r2 - halfSpread2],
    optimalAskQuotes: [r1 + halfSpread1, r2 + halfSpread2],
    optimalHalfSpreads: [halfSpread1, halfSpread2],
    crossAssetInventoryAdjustment: [crossAdj1, crossAdj2],
  };
}
