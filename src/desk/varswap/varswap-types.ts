export interface OutOfTheMoneyOption {
  readonly strike: number;
  readonly optionType: 'CALL' | 'PUT';
  readonly priceUsd: number;
}

export interface VarianceSwapTerms {
  readonly strikeVolatilityPct: number; // K_var = (sigma_K)^2
  readonly notionalVegaUsd: number;     // vega notional = 2 * K_vol * N_var
  readonly timeToMaturityYears: number;
}

export interface ReplicatedVarianceResult {
  readonly fairVarianceStrike: number; // Annualized fair variance (sigma_fair)^2
  readonly fairVolStrikePct: number;   // sqrt(fairVarianceStrike) * 100
  readonly logContractDiscreteIntegral: number;
  readonly optionsCount: number;
}

export interface VarianceSwapPnLResult {
  readonly realizedVolatilityPct: number;
  readonly strikeVolatilityPct: number;
  readonly varianceNotionalUsd: number;
  readonly payoffUsd: number;
  readonly volSwapApproxPayoffUsd: number;
  readonly convexityAdjustmentBps: number;
}
