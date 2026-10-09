export interface LookbackOptionParams {
  spot: number;
  runningMin?: number;
  runningMax?: number;
  strike?: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  timeToExpiry: number;
}

export interface LookbackGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  extremaSensitivity: number;
}

export interface LookbackPriceResult {
  floatingCall: number;
  floatingPut: number;
  fixedCall?: number;
  fixedPut?: number;
  costOfCarry: number;
  greeks: LookbackGreeks;
  lookbackParityError?: number;
}
