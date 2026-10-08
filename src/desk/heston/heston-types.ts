export interface HestonParams {
  S0: number;    // Spot price
  v0: number;    // Initial variance
  kappa: number; // Mean reversion speed of variance
  theta: number; // Long term mean variance
  sigma: number; // Volatility of volatility (vov)
  rho: number;   // Correlation between price and variance BM
  r: number;     // Risk free rate
  q: number;     // Dividend yield
}

export interface HestonOptionParams {
  strike: number;
  timeToMaturity: number;
  isCall: boolean;
}

export interface ComplexNumber {
  re: number;
  im: number;
}

// Legacy aliases to preserve backward compatibility
export interface HestonModelParameters {
  spotPrice: number;
  initialVariance: number;
  kappa: number;
  theta: number;
  sigmaVolOfVol: number;
  rho: number;
  riskFreeRatePct: number;
  dividendYieldPct: number;
}

export interface OptionTerms {
  strikePrice: number;
  timeToExpiryYears: number;
}

export interface HestonOptionPriceResult {
  callPriceUsd: number;
  putPriceUsd: number;
  probabilityP1: number;
  probabilityP2: number;
  fellerConditionRatio: number;
  fellerSatisfied: boolean;
}
