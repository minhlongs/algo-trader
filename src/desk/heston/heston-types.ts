export interface HestonModelParameters {
  readonly spotPrice: number;        // S_0 > 0
  readonly initialVariance: number;  // v_0 > 0
  readonly kappa: number;            // mean-reversion speed kappa > 0
  readonly theta: number;            // long-term variance theta > 0
  readonly sigmaVolOfVol: number;    // volatility of variance sigma > 0
  readonly rho: number;              // correlation rho in [-1, 1]
  readonly riskFreeRatePct: number;  // r in percent (e.g. 3.0 for 3%)
  readonly dividendYieldPct: number; // q in percent (e.g. 0.0)
}

export interface OptionTerms {
  readonly strikePrice: number;       // K > 0
  readonly timeToExpiryYears: number; // tau > 0
}

export interface HestonOptionPriceResult {
  readonly callPriceUsd: number;
  readonly putPriceUsd: number;
  readonly probabilityP1: number;
  readonly probabilityP2: number;
  readonly impliedVolatilityCallPct?: number;
  readonly fellerConditionRatio: number; // 2 * kappa * theta / sigma^2
  readonly fellerSatisfied: boolean;
}
