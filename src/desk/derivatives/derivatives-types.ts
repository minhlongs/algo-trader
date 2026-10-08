/**
 * Volatility Surface & Derivatives Structuring Types
 * Variance swap pricing, VIX-style model-free implied volatility strips, and multi-Greek hedging.
 *
 * @module desk/derivatives/derivatives-types
 */

export interface OptionQuote {
  strike: number;
  callBid: number;
  callAsk: number;
  putBid: number;
  putAsk: number;
}

export interface VarianceSwapQuote {
  strikeVariance: number; // K_var = (sigma_K)^2
  strikeVolPct: number; // sqrt(K_var) * 100
  vegaNotional: number; // N_var = N_vega / (2 * sigma_K)
  varianceNotional: number;
  realizedVariance: number;
  payoffUsd: number;
}

export interface VixStripParameters {
  timeToExpiryYears: number; // T
  riskFreeRate: number; // R
  forwardPrice: number; // F
  quotes: OptionQuote[];
}

export interface VixStripResult {
  vixIndexValue: number; // Expected annualized volatility * 100
  forwardPrice: number;
  atmStrike: number;
  varianceRate: number; // sigma^2
}

export interface PortfolioGreekExposure {
  delta: number;
  gamma: number;
  vega: number;
}

export interface HedgeInstrument {
  symbol: string;
  underlyingPrice: number;
  deltaPerUnit: number;
  gammaPerUnit: number;
  vegaPerUnit: number;
}

export interface GreekNeutralHedgeSolution {
  hedgeUnits: { [symbol: string]: number };
  residualDelta: number;
  residualGamma: number;
  residualVega: number;
  isNeutralized: boolean;
}
