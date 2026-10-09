export type BarrierType =
  | 'down-and-out-call'
  | 'down-and-in-call'
  | 'up-and-out-call'
  | 'up-and-in-call'
  | 'down-and-out-put'
  | 'down-and-in-put'
  | 'up-and-out-put'
  | 'up-and-in-put';

export interface ReinerRubinsteinParams {
  spotPrice: number;
  strikePrice: number;
  barrierPrice: number;
  timeToExpiry: number;
  riskFreeRate: number;
  dividendYield?: number;
  volatility: number;
  rebate?: number;
  barrierType: BarrierType;
}

export interface ReinerRubinsteinGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface ReinerRubinsteinResult {
  optionPrice: number;
  vanillaPrice: number;
  inOutParityPrice: number;
  barrierHit: boolean;
  rebateValue: number;
  mu: number;
  lambda: number;
  greeks: ReinerRubinsteinGreeks;
}
