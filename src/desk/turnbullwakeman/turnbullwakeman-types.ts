/**
 * Turnbull-Wakeman (1991) Arithmetic Asian Option Types
 */

export interface TurnbullWakemanParams {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number; // in years (T)
  timeToAverageStart?: number; // in years (t1), default 0 (current time)
  riskFreeRate: number; // annualized r
  dividendYield?: number; // annualized q, default 0
  volatility: number; // annualized sigma
  isCall: boolean;
}

export interface TurnbullWakemanGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface TurnbullWakemanResult {
  optionPrice: number;
  firstMoment: number; // M1
  secondMoment: number; // M2
  effectiveVol: number; // sigma_A
  d1: number;
  d2: number;
  putCallParityDeviation: number;
  greeks: TurnbullWakemanGreeks;
}
