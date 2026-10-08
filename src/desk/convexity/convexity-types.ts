export interface BondPricingTerms {
  readonly bondId: string;
  readonly couponRatePct: number;
  readonly maturityYears: number;
  readonly yieldPct: number;
  readonly parValueUsd: number;
  readonly couponFrequencyPerYear: number;
}

export interface ConvexityResult {
  readonly bondId: string;
  readonly presentValueUsd: number;
  readonly modifiedDurationYears: number;
  readonly macaulayDurationYears: number;
  readonly effectiveConvexity: number;
  readonly priceChangeEstimatePct: (deltaYieldPct: number) => number;
}

export interface BarbellBulletTrade {
  readonly bulletBond: BondPricingTerms;
  readonly shortTenorBond: BondPricingTerms;
  readonly longTenorBond: BondPricingTerms;
}

export interface BarbellComparisonResult {
  readonly barbellWeightShort: number;
  readonly barbellWeightLong: number;
  readonly matchedDurationYears: number;
  readonly bulletConvexity: number;
  readonly barbellConvexity: number;
  readonly convexityAdvantage: number;
  readonly pnlUnderYieldShockPct: (deltaYieldPct: number) => {
    barbellPct: number;
    bulletPct: number;
    netAdvantagePct: number;
  };
}
