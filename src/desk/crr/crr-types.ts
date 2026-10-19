/**
 * Cox-Ross-Rubinstein (1979) Binomial Option Model Types
 */

export interface CRROptionParams {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  steps: number;
  isCall: boolean;
  isAmerican?: boolean;
}

export interface CRRGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface CRROptionResult {
  optionPrice: number;
  steps: number;
  upFactor: number;
  downFactor: number;
  riskNeutralProb: number;
  earlyExercisePremium: number;
  putCallParityDeviation?: number;
  greeks: CRRGreeks;
}
