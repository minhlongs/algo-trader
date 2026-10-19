export interface HestonParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield: number;
  v0: number; // Initial variance
  kappa: number; // Mean-reversion speed
  theta: number; // Long-term variance
  sigmaV: number; // Volatility of variance
  rho: number; // Correlation between asset and variance
}

export interface HestonGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface HestonPricingResult {
  callPrice: number;
  putPrice: number;
  fellerSatisfied: boolean;
  fellerRatio: number; // 2 * kappa * theta / (sigmaV^2)
  greeks: HestonGreeks;
}
