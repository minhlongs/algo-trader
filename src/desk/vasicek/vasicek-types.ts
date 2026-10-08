export interface VasicekModelParameters {
  readonly currentShortRateR0: number; // Current spot rate r(0) (decimal, e.g. 0.05)
  readonly speedOfReversionA: number;  // Reversion speed a > 0
  readonly longTermMeanB: number;      // Mean reversion level b
  readonly volatilitySigma: number;    // Short rate vol sigma > 0
}

export interface ZeroCouponBondPriceResult {
  readonly maturityYears: number;
  readonly bondPriceUsd: number;       // P(0, T) per $100 par
  readonly continuouslyCompoundedYieldPct: number; // R(0, T)
  readonly instantaneousForwardRatePct: number;    // f(0, T)
  readonly durationB: number;          // B(0, T) sensitivity factor
  readonly convexityFactorA: number;   // A(0, T) factor
}

export interface VasicekYieldCurveTenor {
  readonly tenorYears: number;
  readonly yieldPct: number;
  readonly priceUsd: number;
}
