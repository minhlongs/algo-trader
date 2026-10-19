export type AsianAverageType = 'GEOMETRIC' | 'ARITHMETIC';

export interface AsianOptionParams {
  spot: number;
  strike: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  timeToExpiry: number;
}

export interface AsianGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface AsianPriceResult {
  geometricCall: number;
  geometricPut: number;
  arithmeticCall: number;
  arithmeticPut: number;
  effectiveVolatility: number;
  expectedAverage: number;
  greeks: AsianGreeks;
}
