/**
 * Usage Metering Service
 * Track trades against tier limits and sync with payment provider
 *
 * Facade: types/constants in usage-metering-types.ts, analytics queries in
 * usage-metering-analytics.ts, payment-provider sync in usage-metering-sync.ts,
 * trade tracking in usage-metering-tracking.ts.
 * All public symbols are re-exported here so importers stay unchanged.
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { LicenseTier } from '../../shared/types/license';
import { NowPaymentsService } from './nowpayments-service';
import { EventEmitter } from 'events';
import {
  MONTHLY_LIMITS,
  OVERAGE_PRICE_PER_TRADE,
  type OverageCharge,
  type UsageMetrics,
  type UsageStatus,
} from './usage-metering-types';
import {
  getAllUsageData as getAllUsageDataQuery,
  getMetrics as getMetricsQuery,
  getRevenueSummary as getRevenueSummaryQuery,
} from './usage-metering-analytics';
import { syncUsage as syncUsageWithProvider } from './usage-metering-sync';
import {
  resetForNewPeriod as resetForNewPeriodWrite,
  trackTrade as trackTradeWrite,
} from './usage-metering-tracking';

export type { UsageStatus, UsageMetrics, OverageCharge };
export { MONTHLY_LIMITS, OVERAGE_PRICE_PER_TRADE };

export class UsageMeteringService extends EventEmitter {
  private static instance: UsageMeteringService;
  private redis: RedisClientType;
  private nowPaymentsService?: NowPaymentsService;
  private alertedThresholds: Map<string, Set<number>> = new Map();

  private constructor() {
    super();
    this.redis = getRedisClient();
  }

  static getInstance(paymentService?: NowPaymentsService): UsageMeteringService {
    if (!UsageMeteringService.instance) {
      UsageMeteringService.instance = new UsageMeteringService();
    }
    if (paymentService) {
      UsageMeteringService.instance.nowPaymentsService = paymentService;
    }
    return UsageMeteringService.instance;
  }

  /**
   * Get current period (YYYY-MM format)
   */
  getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Track a trade for usage metering
   */
  async trackTrade(
    licenseKey: string,
    tier: LicenseTier,
    tradeVolume?: number
  ): Promise<UsageStatus> {
    return trackTradeWrite(
      {
        redis: this.redis,
        alertedThresholds: this.alertedThresholds,
        getCurrentPeriod: () => this.getCurrentPeriod(),
        getUsageStatus: (key, t, cachedUsage) => this.getUsageStatus(key, t, cachedUsage),
        emit: (event, payload) => this.emit(event, payload),
      },
      licenseKey,
      tier,
      tradeVolume
    );
  }

  /**
   * Get current usage status for a license
   */
  getUsageStatus(
    licenseKey: string,
    tier: LicenseTier,
    cachedUsage?: number
  ): UsageStatus {
    const period = this.getCurrentPeriod();
    const monthlyLimit = MONTHLY_LIMITS[tier];
    const currentUsage = cachedUsage !== undefined
      ? cachedUsage
      : this.getUsageFromCache(licenseKey, period);

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

  private getUsageFromCache(_licenseKey: string, _period: string): number {
    // This would normally fetch from Redis, but we use cached value from trackTrade
    return 0;
  }

  /**
   * Calculate overage charges for a period
   */
  async calculateOverage(licenseKey: string, tier: LicenseTier): Promise<OverageCharge> {
    const period = this.getCurrentPeriod();
    const status = this.getUsageStatus(licenseKey, tier);

    return {
      licenseKey,
      period,
      units: status.overageUnits,
      pricePerUnit: OVERAGE_PRICE_PER_TRADE[tier],
      totalCost: status.overageCost,
      status: status.overageUnits > 0 ? 'pending' : 'billed',
    };
  }

  /**
   * Get usage metrics for a license
   */
  async getMetrics(licenseKey: string): Promise<UsageMetrics> {
    return getMetricsQuery(this.redis, () => this.getCurrentPeriod(), licenseKey);
  }

  /**
   * Sync usage data with payment provider
   */
  async syncUsage(licenseKey: string, tier: LicenseTier): Promise<boolean> {
    return syncUsageWithProvider(
      {
        redis: this.redis,
        nowPaymentsConfigured: this.nowPaymentsService !== undefined,
        getUsageStatus: (key, t) => this.getUsageStatus(key, t),
        getMetrics: (key) => this.getMetrics(key),
        emit: (event, payload) => this.emit(event, payload),
      },
      licenseKey,
      tier
    );
  }

  /**
   * Get all usage data for revenue analytics
   */
  async getAllUsageData(period?: string): Promise<UsageStatus[]> {
    return getAllUsageDataQuery(this.redis, () => this.getCurrentPeriod(), period);
  }

  /**
   * Get revenue summary for period
   */
  async getRevenueSummary(period?: string): Promise<{
    subscriptionRevenue: number;
    overageRevenue: number;
    totalRevenue: number;
    customerCount: number;
    averageRevenuePerCustomer: number;
  }> {
    return getRevenueSummaryQuery(this.redis, () => this.getCurrentPeriod(), period);
  }

  /**
   * Reset usage for new period (called at period boundary)
   */
  async resetForNewPeriod(licenseKey: string): Promise<void> {
    return resetForNewPeriodWrite(
      this.redis,
      this.alertedThresholds,
      () => this.getCurrentPeriod(),
      licenseKey
    );
  }
}
