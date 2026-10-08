export interface BenchmarkMaturity {
  readonly tenorYears: number;
  readonly label: string;
}

export interface KeyRateDurationResult {
  readonly tenorYears: number;
  readonly keyRateDurationYears: number;
  readonly dv01Usd: number;
}

export interface BondCashFlow {
  readonly timeYears: number;
  readonly cashFlowUsd: number;
}

export interface ImmunizationHedgeResult {
  readonly portfolioPresentValueUsd: number;
  readonly portfolioKrd: KeyRateDurationResult[];
  readonly hedgeWeights: { tenorYears: number; notionalUsd: number }[];
  readonly netDv01ResidualUsd: number;
}
