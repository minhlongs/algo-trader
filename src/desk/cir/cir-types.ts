export interface CirModelParameters {
  readonly currentShortRateR0: number; // e.g. 0.05 for 5%
  readonly speedOfReversionKappa: number; // kappa > 0
  readonly longTermMeanTheta: number; // theta > 0
  readonly volatilitySigma: number; // sigma > 0
}

export interface CirBondPricingResult {
  readonly maturityYears: number;
  readonly bondPriceUsd: number;
  readonly continuouslyCompoundedYieldPct: number;
  readonly instantaneousForwardRatePct: number;
  readonly durationFactorB: number;
  readonly logScaleFactorLnA: number;
  readonly fellerConditionSatisfied: boolean;
  readonly fellerRatio: number; // 2 * kappa * theta / sigma^2
}

export interface CirYieldCurveTenor {
  readonly tenorYears: number;
  readonly yieldPct: number;
  readonly forwardRatePct: number;
  readonly bondPriceUsd: number;
}
