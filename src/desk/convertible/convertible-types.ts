export interface ConvertibleTerms {
  readonly cusipOrTicker: string;
  readonly parValueUsd: number;
  readonly couponRatePct: number;
  readonly maturityYears: number;
  readonly conversionRatio: number;
  readonly creditSpreadBps: number;
  readonly riskFreeRatePct: number;
}

export interface EquityState {
  readonly stockPriceUsd: number;
  readonly annualizedVolatilityPct: number;
  readonly dividendYieldPct: number;
}

export interface ConvertibleValuation {
  readonly conversionValueUsd: number;
  readonly bondFloorUsd: number;
  readonly theoreticalPriceUsd: number;
  readonly conversionPremiumPct: number;
  readonly delta: number;
  readonly gamma: number;
}

export interface DeltaHedgeResult {
  readonly totalBondsHeld: number;
  readonly sharesToShort: number;
  readonly netDeltaExposureUsd: number;
  readonly simulatedStockChangePct: number;
  readonly estimatedGammaProfitUsd: number;
}
