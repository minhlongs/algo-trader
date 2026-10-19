/**
 * Usage Metering Status & Overage Calculations
 * Pure calculations for usage status and overage billing.
 */

import { LicenseTier } from '../../shared/types/license';
import {
  MONTHLY_LIMITS,
  OVERAGE_PRICE_PER_TRADE,
  type OverageCharge,
  type UsageStatus,
} from './usage-metering-types';

export function calculateUsageStatus(
  licenseKey: string,
  tier: LicenseTier,
  period: string,
  cachedUsage?: number,
  getUsageFromCache?: (licenseKey: string, period: string) => number
): UsageStatus {
  const monthlyLimit = MONTHLY_LIMITS[tier];
  const currentUsage =
    cachedUsage !== undefined
      ? cachedUsage
      : (getUsageFromCache ? getUsageFromCache(licenseKey, period) : 0);

  const remaining = Math.max(0, monthlyLimit - currentUsage);
  const percentUsed = (currentUsage / monthlyLimit) * 100;
  const isExceeded = currentUsage > monthlyLimit;
  const overageUnits = isExceeded ? currentUsage - monthlyLimit : 0;
  const overageCost = overageUnits * OVERAGE_PRICE_PER_TRADE[tier];

  return {
    licenseKey,
    period,
    tier,
    monthlyLimit,
    currentUsage,
    remaining,
    percentUsed,
    isExceeded,
    overageUnits,
    overageCost,
  };
}

export function calculateOverageCharge(
  licenseKey: string,
  tier: LicenseTier,
  period: string,
  status: UsageStatus
): OverageCharge {
  return {
    licenseKey,
    period,
    units: status.overageUnits,
    pricePerUnit: OVERAGE_PRICE_PER_TRADE[tier],
    totalCost: status.overageCost,
    status: status.overageUnits > 0 ? 'pending' : 'billed',
  };
}
