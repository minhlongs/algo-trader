export interface KyleMarketParameters {
  readonly fundamentalVarianceSigmaV2: number;  // Prior variance of fundamental asset liquidation value
  readonly noiseOrderFlowVarianceSigmaU2: number; // Variance of uninformed/noise trader net flow
  readonly numberOfTradingRounds?: number;        // Sequential batch auction rounds N (default 1)
}

export interface KyleEquilibriumResult {
  readonly kyleLambda: number;                  // Price impact coefficient: dP / dQ
  readonly informedOrderBeta: number;           // Informed trader aggression: Q_informed = beta * (v - p0)
  readonly marketLiquidityDepth: number;        // 1 / lambda (Kyle depth)
  readonly expectedInformedProfitUsd: number;   // E[Profit] of informed trader
  readonly priceEfficiencyPct: number;          // Reduction in terminal price variance
}

export interface OrderImpactEvaluation {
  readonly unperturbedPriceUsd: number;
  readonly netOrderFlowShares: number;
  readonly executedPriceUsd: number;
  readonly permanentPriceImpactUsd: number;
  readonly slippageBps: number;
}
