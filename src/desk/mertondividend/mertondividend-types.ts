export interface MertonDividendParams {
  spot: number; // S
  strike: number; // K
  timeToExpiry: number; // T in years
  riskFreeRate: number; // r
  dividendYield: number; // q continuous dividend yield
  volatility: number; // sigma
  isCall: boolean;
}

export interface MertonDividendGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  dividendRho: number; // sensitivity to q (psi)
}

export interface MertonDividendResult {
  price: number;
  greeks: MertonDividendGreeks;
  intrinsicValue: number;
  timeValue: number;
}
