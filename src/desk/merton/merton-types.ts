export interface MertonJumpDiffusionParameters {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly diffusionVolatilityPct: number;
  readonly jumpIntensityLambda: number;     // Expected number of Poisson jumps per year
  readonly meanJumpSizeMu: number;          // Mean of log jump size ln(Y)
  readonly jumpVolatilityDelta: number;     // Standard deviation of log jump size ln(Y)
}

export interface MertonOptionPriceResult {
  readonly callPriceUsd: number;
  readonly putPriceUsd: number;
  readonly jumpComponentContributionUsd: number;
  readonly blackScholesBenchmarkCallUsd: number;
  readonly truncatedPoissonTermsCount: number;
}
