/**
 * Wave 243: Avellaneda & Stoikov (2008) Multi-Asset Spread Quoting Engine Types
 * Strictly < 60 LOC, zero :any.
 */

export interface MultiAssetQuoteConfig {
  riskAversionGamma: number;
  terminalTimeT: number;
  orderBookLiquidityKappas: [number, number]; // [kappa1, kappa2]
  assetVolatilities: [number, number];       // [sigma1, sigma2]
  assetCorrelationRho: number;               // rho in [-1, 1]
}

export interface MultiAssetInventoryState {
  currentPrices: [number, number];           // [S1, S2]
  currentInventories: [number, number];      // [q1, q2]
  currentTimeT: number;
}

export interface MultiAssetTwoSidedQuotes {
  reservationPrices: [number, number];
  optimalBidQuotes: [number, number];
  optimalAskQuotes: [number, number];
  optimalHalfSpreads: [number, number];
  crossAssetInventoryAdjustment: [number, number];
}
