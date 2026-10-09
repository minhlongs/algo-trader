export interface Black76Params {
  forwardPrice: number;
  strikePrice: number;
  timeToExpiry: number;
  riskFreeRate: number;
  volatility: number;
  isCall: boolean;
}

export interface Black76Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface Black76Result {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  d1: number;
  d2: number;
  greeks: Black76Greeks;
}
