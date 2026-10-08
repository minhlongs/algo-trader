export interface MbsPoolTerms {
  readonly poolId: string;
  readonly originalBalanceUsd: number;
  readonly grossCouponPct: number;
  readonly servicingFeeBps: number;
  readonly originalMaturityMonths: number;
  readonly psaSpeedPct: number; // e.g. 100 for 100% PSA, 150 for 150% PSA
}

export interface PrepaymentRatePoint {
  readonly month: number;
  readonly cprAnnualizedPct: number;
  readonly smmMonthlyPct: number;
}

export interface MbsMonthlyCashflow {
  readonly month: number;
  readonly beginningBalanceUsd: number;
  readonly scheduledInterestUsd: number;
  readonly scheduledPrincipalUsd: number;
  readonly prepaymentsUsd: number;
  readonly totalCashflowUsd: number;
  readonly endingBalanceUsd: number;
}

export interface MbsCashflowSummary {
  readonly totalPrincipalReceivedUsd: number;
  readonly totalInterestReceivedUsd: number;
  readonly weightedAverageLifeYears: number;
  readonly monthsToLiquidation: number;
}
