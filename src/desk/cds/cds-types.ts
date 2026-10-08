/**
 * Credit Default Swap (CDS) Basis Desk Types
 *
 * @module desk/cds/cds-types
 */

export interface CdsContractQuote {
  readonly referenceEntity: string;
  readonly tenorYears: number;
  readonly parSpreadBps: number; // e.g. 120 bps
  readonly standardRecoveryRatePct: number; // e.g. 40.0%
}

export interface CashBondQuote {
  readonly cusipOrIsin: string;
  readonly maturityYears: number;
  readonly cleanPricePct: number;
  readonly couponRatePct: number;
  readonly yieldToMaturityBps: number;
  readonly benchmarkSwapRateBps: number;
  readonly repoFinancingRateBps: number;
}

export interface HazardRateCurvePoint {
  readonly tenorYears: number;
  readonly hazardRateAnnualizedPct: number; // lambda
  readonly survivalProbabilityPct: number; // Q(t)
  readonly cumulativeDefaultProbabilityPct: number;
}

export interface CdsBondBasisMetrics {
  readonly referenceEntity: string;
  readonly cdsSpreadBps: number;
  readonly assetSwapSpreadBps: number; // ASW
  readonly basisBps: number; // CDS - ASW
  readonly isNegativeBasisArbitrage: boolean;
  readonly netCarrySpreadBps: number; // ASW - CDS - Repo
  readonly annualArbitrageProfitUsdPer10M: number;
}
