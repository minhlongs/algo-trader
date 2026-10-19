export interface BawOptionParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  isCall: boolean;
}

export interface BawGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface BawPricerResult {
  americanPrice: number;
  europeanPrice: number;
  earlyExercisePremium: number;
  criticalSpot: number;
  greeks: BawGreeks;
  iterations: number;
}
