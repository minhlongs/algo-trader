/**
 * Overage Calculator
 * ROIaaS Phase 4 - End-of-day billing calculation for usage overage
 */

import { LicenseTier } from '../../shared/types/license';
import { DAILY_LIMITS } from '../metering/usage-metering-service';
import {
  computeDailyOverage,
  computePeriodOverage,
  formatOverageInvoice,
  getCurrentBillingPeriod,
  type DailyUsageRecord,
  type OverageCharge,
  type OverageSummary,
} from './overage-calculator-helpers';

export {
  computeDailyOverage,
  computePeriodOverage,
  formatOverageInvoice,
  getCurrentBillingPeriod,
  type DailyUsageRecord,
  type OverageCharge,
  type OverageSummary,
};

export class OverageCalculator {
  private static instance: OverageCalculator;

  private constructor() {}

  static getInstance(): OverageCalculator {
    if (!OverageCalculator.instance) {
      OverageCalculator.instance = new OverageCalculator();
    }
    return OverageCalculator.instance;
  }

  calculateDailyOverage(
    _licenseKey: string,
    tier: LicenseTier,
    apiCalls: number,
  ): DailyUsageRecord {
    return computeDailyOverage(tier, apiCalls);
  }

  calculatePeriodOverage(
    licenseKey: string,
    tier: LicenseTier,
    dailyUsage: DailyUsageRecord[],
  ): OverageSummary {
    return computePeriodOverage(licenseKey, tier, dailyUsage, this.getCurrentPeriod());
  }

  async calculateOverageSummary(
    licenseKey: string,
    tier: LicenseTier,
    tenantId?: string,
  ): Promise<OverageSummary> {
    const dailyUsage = this.getDailyUsageRecords(licenseKey, tier);
    const summary = this.calculatePeriodOverage(licenseKey, tier, dailyUsage);
    summary.tenantId = tenantId;
    return summary;
  }

  private getDailyUsageRecords(
    licenseKey: string,
    tier: LicenseTier,
    days: number = 30,
  ): DailyUsageRecord[] {
    const records: DailyUsageRecord[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const simulatedCalls = Math.floor(Math.random() * DAILY_LIMITS[tier] * 1.2);
      const record = this.calculateDailyOverage(licenseKey, tier, simulatedCalls);
      record.date = dateStr;
      records.push(record);
    }

    return records;
  }

  private getCurrentPeriod(): string {
    return getCurrentBillingPeriod();
  }

  generateInvoice(summary: OverageSummary): string {
    return formatOverageInvoice(summary);
  }
}

export const overageCalculator = OverageCalculator.getInstance();
