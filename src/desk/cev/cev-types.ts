export interface CevOptionParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  beta: number; // Elasticity parameter, typically 0 < beta < 2 (e.g. 1.0 or 1.5)
  isCall: boolean;
}

export interface CevGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  elasticityDelta: number; // Sensitivity to beta (dPrice/dBeta)
}

export interface CevPricingResult {
  price: number;
  callPrice: number;
  putPrice: number;
  intrinsicValue: number;
  greeks: CevGreeks;
  alpha: number; // 2 - beta
}
