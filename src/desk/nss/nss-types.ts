export interface NssParameters {
  readonly beta0: number; // Long-term asymptotic level
  readonly beta1: number; // Short-term component (slope)
  readonly beta2: number; // Medium-term component (curvature 1)
  readonly beta3: number; // Additional curvature component (curvature 2)
  readonly tau1: number;  // First decay/scale factor (tau1 > 0)
  readonly tau2: number;  // Second decay/scale factor (tau2 > 0)
}

export interface NssYieldPoint {
  readonly maturityYears: number;
  readonly zeroRatePct: number;
  readonly instantaneousForwardRatePct: number;
  readonly discountFactor: number;
}

export interface NssBondPriceResult {
  readonly price: number;
  readonly yieldToMaturityPct: number;
  readonly macaulayDurationYears: number;
  readonly modifiedDurationYears: number;
  readonly convexity: number;
}
