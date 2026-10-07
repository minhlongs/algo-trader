/**
 * Synthetic Margin & Lending Calculator
 *
 * Implements portfolio margin recognition for offsetting YES/NO binary contracts
 * and calculates continuous borrowing interest accruals for leveraged trading.
 *
 * @module desk/portfolio/synthetic-margin-lending-calculator
 */

import type {
  BinaryContractHolding,
  MarginRequirementResult,
  BorrowFeeAccrual,
} from './synthetic-margin-lending-types';

export class SyntheticMarginLendingCalculator {
  private readonly unhedgedMarginRequirementPct: number;

  constructor(unhedgedMarginRequirementPct: number = 0.50) {
    this.unhedgedMarginRequirementPct = unhedgedMarginRequirementPct;
  }

  public calculatePortfolioMargin(holding: BinaryContractHolding): MarginRequirementResult {
    const totalNotionalUsd = holding.yesQuantity * holding.yesPrice + holding.noQuantity * holding.noPrice;
    const pairedOffsetQuantity = Math.min(holding.yesQuantity, holding.noQuantity);

    const excessYesQty = Math.max(0, holding.yesQuantity - pairedOffsetQuantity);
    const excessNoQty = Math.max(0, holding.noQuantity - pairedOffsetQuantity);

    const unhedgedNotionalUsd = excessYesQty * holding.yesPrice + excessNoQty * holding.noPrice;
    // Paired YES + NO contracts pay out exactly $1.00 at settlement, so paired margin is zero risk
    const requiredMaintenanceMarginUsd = unhedgedNotionalUsd * this.unhedgedMarginRequirementPct;

    const capitalEfficiencyRatio =
      requiredMaintenanceMarginUsd > 0
        ? totalNotionalUsd / requiredMaintenanceMarginUsd
        : totalNotionalUsd > 0
        ? Infinity
        : 1.0;

    return {
      totalNotionalUsd: Math.round(totalNotionalUsd * 100) / 100,
      pairedOffsetQuantity,
      unhedgedNotionalUsd: Math.round(unhedgedNotionalUsd * 100) / 100,
      requiredMaintenanceMarginUsd: Math.round(requiredMaintenanceMarginUsd * 100) / 100,
      capitalEfficiencyRatio: Number.isFinite(capitalEfficiencyRatio)
        ? Math.round(capitalEfficiencyRatio * 100) / 100
        : capitalEfficiencyRatio,
    };
  }

  public calculateBorrowInterest(principalUsd: number, aprPct: number, durationDays: number): BorrowFeeAccrual {
    const dailyRate = aprPct / 100 / 365;
    const accruedInterestUsd = principalUsd * dailyRate * durationDays;

    return {
      principalUsd,
      aprPct,
      durationDays,
      accruedInterestUsd: Math.round(accruedInterestUsd * 100) / 100,
    };
  }
}
