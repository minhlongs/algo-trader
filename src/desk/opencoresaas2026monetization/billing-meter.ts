/**
 * Real-Time MCU & Quota Billing Meter
 * Tracks API requests and strategy compute units, raising HTTP 402 on limit exhaustion.
 *
 * @module desk/opencoresaas2026monetization/billing-meter
 */

import { TierLevel } from './catalog';

export interface QuotaAllocation {
  readonly tier: TierLevel;
  readonly monthlyMcuLimit: number;
  readonly maxConcurrentStrategies: number;
  readonly maxApiRequestsPerDay: number;
}

export const TIER_QUOTAS: Record<TierLevel, QuotaAllocation> = {
  BASIC: {
    tier: 'BASIC',
    monthlyMcuLimit: 1_000,
    maxConcurrentStrategies: 2,
    maxApiRequestsPerDay: 5_000,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    monthlyMcuLimit: 25_000,
    maxConcurrentStrategies: 10,
    maxApiRequestsPerDay: 100_000,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    monthlyMcuLimit: 250_000,
    maxConcurrentStrategies: 50,
    maxApiRequestsPerDay: 2_000_000,
  },
  MASTER: {
    tier: 'MASTER',
    monthlyMcuLimit: 1_000_000,
    maxConcurrentStrategies: 250,
    maxApiRequestsPerDay: 20_000_000,
  },
};

export const TIER_ENTITLEMENTS = TIER_QUOTAS;

export interface QuotaCheckResult {
  readonly isAllowed: boolean;
  readonly statusCode: 200 | 402;
  readonly remainingMcu: number;
  readonly currentUsage: number;
  readonly maxLimit: number;
  readonly upgradeUrl?: string;
  readonly error?: string;
}

export class BillingMeter {
  private usage = new Map<string, number>();

  recordConsumption(tenantId: string, mcuUsed: number): void {
    const current = this.usage.get(tenantId) || 0;
    this.usage.set(tenantId, current + mcuUsed);
  }

  getUsage(tenantId: string): number {
    return this.usage.get(tenantId) || 0;
  }

  resetUsage(tenantId: string): void {
    this.usage.delete(tenantId);
  }

  checkQuota(tenantId: string, tier: TierLevel, requestedMcu = 1): QuotaCheckResult {
    const quota = TIER_QUOTAS[tier] || TIER_QUOTAS.BASIC;
    const current = this.getUsage(tenantId);

    if (current + requestedMcu > quota.monthlyMcuLimit) {
      return {
        isAllowed: false,
        statusCode: 402,
        remainingMcu: Math.max(0, quota.monthlyMcuLimit - current),
        currentUsage: current,
        maxLimit: quota.monthlyMcuLimit,
        error: `Monthly MCU quota of ${quota.monthlyMcuLimit.toLocaleString()} exceeded.`,
        upgradeUrl: `https://app.algo-trader.dev/billing/recharge?tenant=${tenantId}&mcu=additional`,
      };
    }

    return {
      isAllowed: true,
      statusCode: 200,
      remainingMcu: quota.monthlyMcuLimit - (current + requestedMcu),
      currentUsage: current,
      maxLimit: quota.monthlyMcuLimit,
    };
  }
}
