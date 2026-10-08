export interface HullWhiteParams {
  readonly meanReversionA: number;
  readonly shortRateVolSigma: number;
  readonly currentShortRateR0: number;
}

export interface ZeroBondPrice {
  readonly maturityYearsT: number;
  readonly discountFactorP: number;
  readonly zeroYieldPct: number;
  readonly bFactor: number;
  readonly aFactor: number;
}

export interface JamshidianOptionResult {
  readonly strikeYieldPct: number;
  readonly swaptionTenorYears: number;
  readonly swaptionPriceBps: number;
  readonly isCallPayer: boolean;
  readonly criticalShortRateRStar: number;
}
