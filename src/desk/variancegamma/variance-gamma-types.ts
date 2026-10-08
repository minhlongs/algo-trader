export interface ComplexNumber {
  re: number;
  im: number;
}

export interface VarianceGammaParams {
  spotPrice: number;       // S0
  strikePrice: number;     // K
  timeToMaturity: number;  // T
  riskFreeRate: number;    // r
  dividendYield: number;   // q
  sigma: number;           // Volatility of subordinated Brownian motion
  nu: number;              // Variance of the Gamma subordinator (kurtosis control)
  theta: number;           // Drift of subordinated Brownian motion (skewness control)
  isCall: boolean;
}

export interface VarianceGammaResult {
  price: number;
  impliedBlackScholesVolEstimate: number;
  skewnessCharacteristic: number;
  excessKurtosisEstimate: number;
}

// Backward compatibility types for VarianceGammaCharFn
export interface VgModelParameters {
  sigma: number;
  nu: number;
  theta: number;
}

export interface VgMomentsResult {
  mean: number;
  variance: number;
  skewness: number;
  excessKurtosis: number;
}
