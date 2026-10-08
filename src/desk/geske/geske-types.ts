export type CompoundOptionType = 'CallOnCall' | 'CallOnPut' | 'PutOnCall' | 'PutOnPut';

export interface GeskeParams {
  spotPrice: number;            // Current asset price S
  strike1: number;              // Strike price of compound option K1
  strike2: number;              // Strike price of underlying option K2
  maturity1: number;            // Expiry of compound option T1 (years)
  maturity2: number;            // Expiry of underlying option T2 (years, T2 > T1)
  riskFreeRate: number;         // Continuous risk-free rate r
  dividendYield: number;        // Continuous dividend yield q
  volatility: number;           // Asset volatility sigma
  optionType: CompoundOptionType;
}

export interface GeskeResult {
  price: number;
  criticalPrice: number;        // S* at T1 where underlying option equals K1
  rho: number;                  // Correlation sqrt(T1 / T2)
  underlyingOptionPrice: number;// Plain vanilla BS price of underlying option at t=0
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}
