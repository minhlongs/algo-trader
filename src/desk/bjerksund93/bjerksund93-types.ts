export interface Bjerksund93Params {
  spot: number; // S
  strike: number; // K
  timeToExpiry: number; // T
  riskFreeRate: number; // r
  dividendYield: number; // q (continuous dividend yield, b = r - q)
  volatility: number; // sigma
  isCall: boolean;
}

export interface Bjerksund93Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface Bjerksund93Result {
  price: number;
  triggerPrice: number; // Early exercise boundary I
  earlyExercisePremium: number; // Price - European BS Price
  greeks: Bjerksund93Greeks;
}
