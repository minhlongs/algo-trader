export interface Rubinstein83Params {
  spotPrice: number;
  strikePrice: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  displacementAlpha: number; // Displaced diffusion parameter alpha in (0, 1]
  isCall: boolean;
}

export interface Rubinstein83Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface Rubinstein83Result {
  optionPrice: number;
  intrinsicValue: number;
  timeValue: number;
  effectiveSpot: number;
  effectiveStrike: number;
  effectiveVolatility: number;
  d1: number;
  d2: number;
  greeks: Rubinstein83Greeks;
}
