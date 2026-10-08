export interface MertonYieldOptionParameters {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly continuousDividendYieldPct: number; // q in %
  readonly volatilityPct: number;              // sigma in %
}

export interface MertonYieldGreeks {
  readonly callDelta: number;
  readonly putDelta: number;
  readonly gamma: number;
  readonly vega: number;
  readonly callTheta: number;
  readonly putTheta: number;
  readonly callRho: number;
  readonly putRho: number;
  readonly callDividendRhoPhi: number;
  readonly putDividendRhoPhi: number;
  readonly vanna: number;
  readonly volga: number;
}

export interface MertonYieldOptionResult {
  readonly callPrice: number;
  readonly putPrice: number;
  readonly d1: number;
  readonly d2: number;
  readonly forwardPrice: number;
  readonly greeks: MertonYieldGreeks;
}
