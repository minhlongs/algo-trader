export interface MargrabeParams {
  spot1: number;             // Price of asset 1 to receive (S_1)
  spot2: number;             // Price of asset 2 to deliver (S_2)
  volatility1: number;       // Volatility of asset 1 (sigma_1 > 0)
  volatility2: number;       // Volatility of asset 2 (sigma_2 > 0)
  correlation: number;       // Correlation rho between asset 1 and asset 2 in [-1, 1]
  timeToMaturity: number;    // Time to maturity T in years (T > 0)
  dividendYield1?: number;   // Continuous dividend yield q_1 >= 0 (default 0)
  dividendYield2?: number;   // Continuous dividend yield q_2 >= 0 (default 0)
}

export interface MargrabeGreeks {
  delta1: number;            // dC/dS_1
  delta2: number;            // dC/dS_2
  gamma1: number;            // d^2C/dS_1^2
  gamma2: number;            // d^2C/dS_2^2
  crossGamma: number;        // d^2C/(dS_1 dS_2)
  vega1: number;             // dC/dsigma_1
  vega2: number;             // dC/dsigma_2
  theta: number;             // dC/dT
}

export interface MargrabeResult {
  optionPrice: number;       // Present value of max(S_1 - S_2, 0)
  compositeVol: number;      // sqrt(sigma_1^2 + sigma_2^2 - 2*rho*sigma_1*sigma_2)
  d1: number;
  d2: number;
  greeks: MargrabeGreeks;
  exchangeParityError: number; // Verification of exchange symmetry
}
