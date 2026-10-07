/**
 * Synthetic Margin & Lending Calculator Types
 *
 * Contracts for calculating paired binary margin requirements,
 * annualized borrow interest accruals, and leverage bounds.
 *
 * @module desk/portfolio/synthetic-margin-lending-types
 */

export interface BinaryContractHolding {
  readonly marketId: string;
  readonly yesQuantity: number;
  readonly noQuantity: number;
  readonly yesPrice: number;
  readonly noPrice: number;
}

export interface MarginRequirementResult {
  readonly totalNotionalUsd: number;
  readonly pairedOffsetQuantity: number;
  readonly unhedgedNotionalUsd: number;
  readonly requiredMaintenanceMarginUsd: number;
  readonly capitalEfficiencyRatio: number;
}

export interface BorrowFeeAccrual {
  readonly principalUsd: number;
  readonly aprPct: number;
  readonly durationDays: number;
  readonly accruedInterestUsd: number;
}
