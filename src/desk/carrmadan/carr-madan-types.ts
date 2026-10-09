export type OptionPayoffType = 'call' | 'put';

export interface CarrMadanParams {
  spotPrice: number;        // S_0
  strikePrice: number;      // K
  timeToMaturity: number;   // T in years
  riskFreeRate: number;     // r
  dividendYield: number;    // q
  volatility: number;       // sigma (for Black-Scholes characteristic function)
  alpha?: number;           // Dampening parameter alpha > 0 (default: 1.5)
  integrationUpper?: number;// Numerical upper bound (default: 120.0)
  quadratureSteps?: number; // Number of Simpson integration intervals (default: 1024)
}

export interface OptionPriceResult {
  spotPrice: number;
  strikePrice: number;
  timeToMaturity: number;
  callPrice: number;
  putPrice: number;
  alpha: number;
  putCallParityError: number;
  intrinsicValue: number;
}
