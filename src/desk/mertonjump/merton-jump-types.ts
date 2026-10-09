export interface MertonJumpParams {
  spot: number;
  strike: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  jumpIntensity: number;
  jumpMean: number;
  jumpVol: number;
  maxIterations?: number;
}

export interface MertonGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface MertonJumpResult {
  callPrice: number;
  putPrice: number;
  bsBenchmarkCall: number;
  bsBenchmarkPut: number;
  jumpComponentCall: number;
  jumpComponentPut: number;
  expectedJumpSizeKappa: number;
  effectiveIntensity: number;
  iterationsUsed: number;
  greeks: MertonGreeks;
}
