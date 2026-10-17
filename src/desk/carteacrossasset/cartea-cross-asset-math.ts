/**
 * Wave 224: Cartea, Jaimungal & Ricci (2014) Algorithmic Trading with Cross-Asset Signals Math.
 *
 * Computes optimal ask/bid quote skews conditioned on inventory and lead-lag cross alpha.
 * Strictly < 80 LOC, zero mocks, zero :any.
 */

import type { CarteaCrossAssetConfig, QuoteSkewResult } from './cartea-cross-asset-types';

export class CarteaCrossAssetMath {
  public static computeQuoteSkews(
    config: CarteaCrossAssetConfig,
    currentInventoryQ: number,
    crossAssetAlpha: number
  ): QuoteSkewResult {
    const gamma = Math.max(1e-6, config.inventoryAversionGamma);
    const kappa = Math.max(1e-6, config.orderIntensityKappa);
    const sigma2 = Math.pow(config.volatilitySigma, 2);

    // Reservation spread component
    const spreadComp = (1 / gamma) * Math.log(1 + gamma / kappa);

    // Inventory risk penalty
    const inventoryTermAsk = ((2 * currentInventoryQ - 1) / (2 * kappa)) * gamma * sigma2;
    const inventoryTermBid = -((2 * currentInventoryQ + 1) / (2 * kappa)) * gamma * sigma2;

    // Cross-asset drift shift
    const alphaShift = crossAssetAlpha / kappa;

    const ask = config.halfSpreadBase + spreadComp + inventoryTermAsk - alphaShift;
    const bid = config.halfSpreadBase + spreadComp + inventoryTermBid + alphaShift;

    // Net quote bias: positive means shifted higher (skewed toward buying)
    const netBias = (bid - ask) / 2;

    return {
      askSpread: Number(Math.max(0.0001, ask).toFixed(5)),
      bidSpread: Number(Math.max(0.0001, bid).toFixed(5)),
      netQuoteBias: Number(netBias.toFixed(5)),
      recommendedMidAdjustment: Number(alphaShift.toFixed(5)),
    };
  }
}
