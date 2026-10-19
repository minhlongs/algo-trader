/**
 * Wave 224: Cartea, Jaimungal & Ricci (2014) Algorithmic Trading with Cross-Asset Signals Types.
 *
 * Strictly < 40 LOC, zero :any.
 */

export interface CarteaCrossAssetConfig {
  inventoryAversionGamma: number;
  orderIntensityKappa: number;
  volatilitySigma: number;
  halfSpreadBase: number;
}

export interface QuoteSkewResult {
  askSpread: number;
  bidSpread: number;
  netQuoteBias: number;
  recommendedMidAdjustment: number;
}
