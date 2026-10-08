export interface OptionQuoteStrike {
  readonly strikePrice: number;
  readonly callPriceUsd?: number;
  readonly putPriceUsd?: number;
}

export interface CarrMadanReplicationTerms {
  readonly spotPrice: number;
  readonly forwardPrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly quotes: OptionQuoteStrike[];
}

export interface CarrMadanReplicationResult {
  readonly fairVarianceStrikePct2: number; // Annualized variance strike (sigma_var^2 * 100)
  readonly fairVolatilityStrikePct: number; // sqrt(variance) * 100
  readonly otmPutsWeightContribution: number;
  readonly otmCallsWeightContribution: number;
  readonly strikeCountUsed: number;
  readonly forwardPrice: number;
}
