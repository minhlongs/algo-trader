export interface CrankOptionParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  isCall: boolean;
  isAmerican: boolean;
  gridStepsS?: number; // Number of spot nodes (default 200)
  gridStepsT?: number; // Number of time steps (default 200)
}

export interface CrankGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface CrankResult {
  price: number;
  earlyExercisePremium: number;
  greeks: CrankGreeks;
  gridNodes: number;
  timeSteps: number;
}
