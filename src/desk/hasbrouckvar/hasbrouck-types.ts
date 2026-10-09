export interface HasbrouckObservation {
  quoteRevision: number; // r_t: Midpoint return / quote change
  tradeSign: number; // x_t: -1 (Sell), 0 (No trade), +1 (Buy)
}

export interface HasbrouckParams {
  lags: number; // p: number of lags in the bivariate VAR
}

export interface VarCoefficients {
  alphaLags: number[]; // Coefficients of r_{t-i} on r_t
  betaZero: number; // Contemporary coefficient of x_t on r_t
  betaLags: number[]; // Coefficients of x_{t-i} on r_t
  gammaLags: number[]; // Coefficients of r_{t-i} on x_t
  phiLags: number[]; // Coefficients of x_{t-i} on x_t
  residualVarR: number; // Variance of quote innovation epsilon_{1, t}
  residualVarX: number; // Variance of trade innovation epsilon_{2, t}
  residualCov: number; // Covariance between innovations
}

export interface HasbrouckResult {
  lags: number;
  varCoefficients: VarCoefficients;
  permanentPriceImpact: number; // Sum of VMA impact coefficients Psi(1)
  totalVariance: number; // Total random walk quote revision variance sigma_w^2
  tradeRelatedVariance: number; // Trade-correlated component of permanent variance
  informationShare: number; // Ratio of trade-correlated to total permanent variance (R_w^2)
}
