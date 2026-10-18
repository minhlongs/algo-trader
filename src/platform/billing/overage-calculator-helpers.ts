/**
 * Overage Calculator — Pure Billing Types, Rate & Invoice Formatting Helpers
 */

import { LicenseTier } from '../../shared/types/license';
import { DAILY_LIMITS, OVERAGE_PRICE_PER_CALL } from '../metering/usage-metering-service';

export interface OverageCharge {
  metric: string;
  overageUnits: number;
  unitPrice: number;
  totalCharge: number;
}

export interface OverageSummary {
  licenseKey: string;
  tenantId?: string;
  tier: LicenseTier;
  period: string;
  charges: OverageCharge[];
  totalOverage: number;
  calculatedAt: string;
}

export interface DailyUsageRecord {
  date: string;
  apiCalls: number;
  dailyLimit: number;
  overageUnits: number;
  overageCost: number;
}

export function computeDailyOverage(
  tier: LicenseTier,
  apiCalls: number,
  date: string = new Date().toISOString().split('T')[0],
): DailyUsageRecord {
  const dailyLimit = DAILY_LIMITS[tier];
  const unitPrice = OVERAGE_PRICE_PER_CALL[tier];
  const overageUnits = Math.max(0, apiCalls - dailyLimit);
  const overageCost = overageUnits * unitPrice;

  return {
    date,
    apiCalls,
    dailyLimit,
    overageUnits,
    overageCost,
  };
}

export function getCurrentBillingPeriod(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function computePeriodOverage(
  licenseKey: string,
  tier: LicenseTier,
  dailyUsage: DailyUsageRecord[],
  period: string = getCurrentBillingPeriod(),
): OverageSummary {
  const charges: OverageCharge[] = [];
  let totalOverage = 0;

  const _totalApiCalls = dailyUsage.reduce((sum, day) => sum + day.apiCalls, 0);
  const totalOverageUnits = dailyUsage.reduce((sum, day) => sum + day.overageUnits, 0);
  const totalOverageCost = dailyUsage.reduce((sum, day) => sum + day.overageCost, 0);

  if (totalOverageUnits > 0) {
    charges.push({
      metric: 'api_calls',
      overageUnits: totalOverageUnits,
      unitPrice: OVERAGE_PRICE_PER_CALL[tier],
      totalCharge: totalOverageCost,
    });
    totalOverage = totalOverageCost;
  }

  return {
    licenseKey,
    tier,
    period,
    charges,
    totalOverage,
    calculatedAt: new Date().toISOString(),
  };
}

export function formatOverageInvoice(summary: OverageSummary): string {
  let invoice = `OVERAGE INVOICE\n================\n\n`;
  invoice += `License: ${summary.licenseKey}\n`;
  if (summary.tenantId) {
    invoice += `Tenant: ${summary.tenantId}\n`;
  }
  invoice += `Tier: ${summary.tier}\n`;
  invoice += `Period: ${summary.period}\n`;
  invoice += `Generated: ${summary.calculatedAt}\n\n`;
  invoice += `CHARGES\n--------\n`;

  for (const charge of summary.charges) {
    invoice += `${charge.metric}: ${charge.overageUnits} units x $${charge.unitPrice.toFixed(4)} = $${charge.totalCharge.toFixed(2)}\n`;
  }

  invoice += `\nTOTAL: $${summary.totalOverage.toFixed(2)}\n`;
  return invoice;
}
