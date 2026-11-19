import { costNumber, MANDATORY_COST_KEYS, roundCost } from './l2-collector-cost-assumptions';
import type { L2BudgetHoldReason, L2CostAssumptions, L2MarketTierProjection, L2NumberRange, L2R2Billing } from './l2-collector-cost-types';

export function ceilBillingUnits(value: number): number {
  costNumber('billing usage', value);
  return Math.ceil(value);
}

export function billL2R2Usage(a: L2CostAssumptions, combinedGb: L2NumberRange): L2R2Billing {
  const copies = 1 + a.additionalArchiveCopies;
  const classAOperations = costNumber('total Class A operations', a.r2ClassAOperationsPerMonth * copies, 0, true);
  const classBOperations = costNumber('total Class B operations', a.r2ClassBOperationsPerMonth * copies, 0, true);
  const billableClassAMillions = ceilBillingUnits(classAOperations / 1_000_000);
  const billableClassBMillions = ceilBillingUnits(classBOperations / 1_000_000);
  const min = ceilBillingUnits(combinedGb.min);
  const max = ceilBillingUnits(combinedGb.max);
  return {
    billableStorageGbMonth: { min, max },
    storageMonthlyUsd: { min: roundCost(min * a.r2RateUsdPerGbMonth, 2), max: roundCost(max * a.r2RateUsdPerGbMonth, 2) },
    classAOperations,
    classBOperations,
    billableClassAMillions,
    billableClassBMillions,
    operationsMonthlyUsd: roundCost(billableClassAMillions * a.r2ClassARateUsdPerMillion + billableClassBMillions * a.r2ClassBRateUsdPerMillion, 2),
    freeTierDeducted: false,
  };
}

/** Compare unrounded amounts to avoid approving a $30.004 known floor displayed as $30.00. */
export function knownL2TotalUsd(a: L2CostAssumptions, billing: L2R2Billing, edge: 'min' | 'max'): number {
  const other = MANDATORY_COST_KEYS.reduce((sum, key) => sum + (a[key] ?? 0), 0);
  return costNumber('known monthly total', a.vpsMonthlyUsdRange[edge === 'min' ? 0 : 1]
    + billing.billableStorageGbMonth[edge] * a.r2RateUsdPerGbMonth
    + billing.billableClassAMillions * a.r2ClassARateUsdPerMillion
    + billing.billableClassBMillions * a.r2ClassBRateUsdPerMillion + other);
}

export function evaluateL2Budget(
  a: L2CostAssumptions, min: number, max: number, stressMax: number,
): L2MarketTierProjection['budgetEvaluation'] {
  const unknownMandatoryCostItems = MANDATORY_COST_KEYS.filter((key) => a[key] === null);
  const holdReasons: L2BudgetHoldReason[] = [];
  if (min > a.monthlyBudgetUsd) holdReasons.push('MINIMUM_KNOWN_COST_EXCEEDS_BUDGET');
  if (unknownMandatoryCostItems.length) holdReasons.push('UNKNOWN_MANDATORY_COSTS');
  if (min <= a.monthlyBudgetUsd && max > a.monthlyBudgetUsd) holdReasons.push('MODELED_RANGE_EXCEEDS_BUDGET');
  if (max <= a.monthlyBudgetUsd && stressMax > a.monthlyBudgetUsd) holdReasons.push('COMPRESSION_STRESS_EXCEEDS_BUDGET');
  return {
    monthlyBudgetUsd: a.monthlyBudgetUsd,
    status: holdReasons.length ? 'BUDGET_HOLD' : 'WITHIN_BUDGET_KNOWN_COSTS',
    holdReasons,
    unknownMandatoryCostItems,
    isUpperBoundGuaranteed: false,
    provisioningAuthorized: false,
  };
}
