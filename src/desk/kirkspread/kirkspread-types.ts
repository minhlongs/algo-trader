export interface KirkSpreadParams {
  asset1Forward: number; // F_1
  asset2Forward: number; // F_2
  strike: number; // K (can be zero for Margrabe exchange option)
  timeToExpiry: number; // T in years
  riskFreeRate: number; // r continuous risk-free rate
  volatility1: number; // sigma_1
  volatility2: number; // sigma_2
  correlation: number; // rho in [-1, 1]
  isCall: boolean;
}

export interface KirkSpreadGreeks {
  delta1: number; // dC / dF_1
  delta2: number; // dC / dF_2
  gamma: number; // d^2C / dF_1^2
  vega: number; // dC / d sigma*
  theta: number; // dC / dt
  rho: number; // dC / dr
}

export interface KirkSpreadResult {
  optionPrice: number;
  intrinsicValue: number;
  timeValue: number;
  adjustedVolatility: number; // sigma*
  d1: number;
  d2: number;
  greeks: KirkSpreadGreeks;
}
