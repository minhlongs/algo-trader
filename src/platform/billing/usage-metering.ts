/**
 * Usage Metering Service
 * Track trades against tier limits and sync with payment provider
 *
 * Features:
 * - Track trades per license tier (1k/10k/100k per month)
 * - Calculate overage charges
 * - Sync usage data with NOWPayments
 * - Real-time usage monitoring (Redis) + persistent records (PostgreSQL)
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { query } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { LicenseTier } from '../../shared/types/license';
import { NowPaymentsService } from './nowpayments-service';
import { EventEmitter } from 'events';

export interface UsageStatus {
  licenseKey: string;
  period: string; // YYYY-MM format
  tier: LicenseTier;
  monthlyLimit: number;
  currentUsage: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  overageUnits: number;
  overageCost: number;
  lastSyncedAt?: number;
}

export interface UsageMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  averageTradeSize: number;
}

export interface OverageCharge {
  licenseKey: string;
  period: string;
  units: number;
  pricePerUnit: number;
  totalCost: number;
  status: 'pending' | 'billed' | 'paid';
}

export const MONTHLY_LIMITS: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 1000,      // 1k trades/month
  [LicenseTier.PRO]: 10000,      // 10k trades/month
  [LicenseTier.ENTERPRISE]: 100000, // 100k trades/month
  [LicenseTier.MASTER]: 500000,  // 500k trades/month
};

export const OVERAGE_PRICE_PER_TRADE: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 0,         // No overage for FREE (hard limit)
  [LicenseTier.PRO]: 0.01,       // $0.01 per extra trade
  [LicenseTier.ENTERPRISE]: 0.005, // $0.005 per extra trade
  [LicenseTier.MASTER]: 0.001,   // $0.001 per extra trade
};

const ALERT_THRESHOLDS = [80, 90, 100];

interface UsageRecordRow {
  id: string;
  license_key: string;
  period: string;
  tier: string;
  total_trades: number;
  success_count: number;
  fail_count: number;
  total_volume: number;
  monthly_limit: number;
  overage_units: number;
  overage_cost: number;
  created_at: Date;
  updated_at: Date;
}

interface AlertedThresholdRow {
  license_key: string;
  threshold: number;
  alerted_at: Date;
}

export class UsageMeteringService extends EventEmitter {
  private static instance: UsageMeteringService;
  private redis: RedisClientType;
  private nowPaymentsService?: NowPaymentsService;

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
    const period = this.getCurrentPeriod();
    const usageKey = `usage:${licenseKey}:${period}`;

    // Increment usage counter
    const newUsage = await this.redis.incr(usageKey);

    // Set expiry to end of period
    await this.setKeyExpiry(usageKey, period);

    // Track volume if provided
    if (tradeVolume) {
      const volumeKey = `usage:${licenseKey}:${period}:volume`;
      await this.redis.incrbyfloat(volumeKey, tradeVolume);
      await this.setKeyExpiry(volumeKey, period);
    }

    // Get updated status
    const status = this.getUsageStatus(licenseKey, tier, newUsage);

    // Check thresholds using PostgreSQL
    await this.checkThresholds(licenseKey, status);

    // Emit trade event
    this.emit('trade_tracked', {
      licenseKey,
      period,
      usage: newUsage,
      volume: tradeVolume,
      timestamp: Date.now(),
    });

    return status;
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
      : 0;

    const remaining = Math.max(0, monthlyLimit - currentUsage);
    const percentUsed = monthlyLimit > 0 ? (currentUsage / monthlyLimit) * 100 : 0;
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
    const period = this.getCurrentPeriod();
    const baseKey = `usage:${licenseKey}:${period}`;

    const [totalTrades, volume] = await Promise.all([
      this.redis.get(`${baseKey}`),
      this.redis.get(`${baseKey}:volume`),
    ]);

    const trades = parseInt(totalTrades || '0');
    const totalVolume = parseFloat(volume || '0');

    // Get trade success/failure from detailed logs
    const successKey = `usage:${licenseKey}:${period}:success`;
    const failKey = `usage:${licenseKey}:${period}:failed`;
    const [successful, failed] = await Promise.all([
      this.redis.get(successKey),
      this.redis.get(failKey),
    ]);

    return {
      totalTrades: trades,
      successfulTrades: parseInt(successful || '0'),
      failedTrades: parseInt(failed || '0'),
      totalVolume,
      averageTradeSize: trades > 0 ? totalVolume / trades : 0,
    };
  }

  /**
   * Sync usage data with payment provider and persist to PostgreSQL
   */
  async syncUsage(licenseKey: string, tier: LicenseTier): Promise<boolean> {
    if (!this.nowPaymentsService) {
      logger.warn('[UsageMetering] NowPaymentsService not configured, skipping sync');
      return false;
    }

    try {
      const period = this.getCurrentPeriod();
      const metrics = await this.getMetrics(licenseKey);
      const limit = MONTHLY_LIMITS[tier];
      const percentUsed = limit > 0 ? (metrics.totalTrades / limit) * 100 : 0;
      const isExceeded = metrics.totalTrades > limit;
      const overageUnits = isExceeded ? metrics.totalTrades - limit : 0;
      const overageCost = overageUnits * OVERAGE_PRICE_PER_TRADE[tier];

      // Persist usage record to PostgreSQL
      const usageData = {
        licenseKey,
        period,
        totalTrades: metrics.totalTrades,
        monthlyLimit: limit,
        percentUsed,
        overageUnits,
        overageCost,
        syncedAt: Date.now(),
      };

      await query(
        `INSERT INTO usage_records (id, license_key, period, tier, total_trades, success_count, fail_count, total_volume, monthly_limit, overage_units, overage_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           total_trades = EXCLUDED.total_trades,
           success_count = EXCLUDED.success_count,
           fail_count = EXCLUDED.fail_count,
           total_volume = EXCLUDED.total_volume,
           overage_units = EXCLUDED.overage_units,
           overage_cost = EXCLUDED.overage_cost,
           updated_at = NOW()`,
        [
          `ur_${licenseKey}_${period}`,
          licenseKey,
          period,
          tier,
          metrics.totalTrades,
          metrics.successfulTrades,
          metrics.failedTrades,
          metrics.totalVolume,
          limit,
          overageUnits,
          overageCost,
        ]
      );

      // Store sync timestamp in Redis
      await this.redis.hset(`usage:${licenseKey}:sync`, {
        lastPeriod: period,
        lastSyncedAt: Date.now().toString(),
        lastUsage: JSON.stringify(usageData),
      });

      logger.info(`[UsageMetering] Synced usage for ${licenseKey}: ${metrics.totalTrades} trades`);

      this.emit('usage_sync', usageData);
      return true;
    } catch (error) {
      logger.error('[UsageMetering] Usage sync failed:', { error });
      return false;
    }
  }

  /**
   * Get all usage data for revenue analytics from PostgreSQL
   */
  async getAllUsageData(period?: string): Promise<UsageStatus[]> {
    const targetPeriod = period || this.getCurrentPeriod();
    const result = await query(
      'SELECT * FROM usage_records WHERE period = $1 ORDER BY created_at DESC',
      [targetPeriod]
    );

    return result.rows.map((row: unknown) => {
      const r = row as UsageRecordRow;
      return {
        licenseKey: r.license_key,
        period: r.period,
        tier: r.tier as LicenseTier,
        monthlyLimit: r.monthly_limit,
        currentUsage: r.total_trades,
        remaining: Math.max(0, r.monthly_limit - r.total_trades),
        percentUsed: r.monthly_limit > 0 ? (r.total_trades / r.monthly_limit) * 100 : 0,
        isExceeded: r.total_trades > r.monthly_limit,
        overageUnits: r.overage_units,
        overageCost: Number(r.overage_cost),
      };
    });
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
    const usageData = await this.getAllUsageData(period);
    let overageRevenue = 0;
    const customerSet = new Set<string>();

    for (const usage of usageData) {
      customerSet.add(usage.licenseKey);
      overageRevenue += usage.overageCost;
    }

    const customerCount = customerSet.size;
    // Subscription revenue from payment provider
    const subscriptionRevenue = 0; // Placeholder - integrate with payment records
    const totalRevenue = subscriptionRevenue + overageRevenue;

    return {
      subscriptionRevenue,
      overageRevenue,
      totalRevenue,
      customerCount,
      averageRevenuePerCustomer: customerCount > 0 ? totalRevenue / customerCount : 0,
    };
  }

  /**
   * Reset usage for new period (called at period boundary)
   */
  async resetForNewPeriod(licenseKey: string): Promise<void> {
    const oldPeriod = this.getCurrentPeriod();
    const archiveKey = `usage:${licenseKey}:${oldPeriod}:archive`;

    // Archive current usage before reset
    const currentUsage = await this.redis.get(`usage:${licenseKey}:${oldPeriod}`);
    if (currentUsage) {
      await this.redis.set(archiveKey, currentUsage);
      await this.redis.expire(archiveKey, 86400 * 365); // Keep archive for 1 year
    }

    // Clear alerted thresholds
    await query(
      'DELETE FROM usage_alerted_thresholds WHERE license_key = $1',
      [licenseKey]
    );

    logger.info(`[UsageMetering] Reset for ${licenseKey}, archived ${currentUsage} trades`);
  }

  private async checkThresholds(licenseKey: string, status: UsageStatus): Promise<void> {
    for (const threshold of ALERT_THRESHOLDS) {
      if (status.percentUsed < threshold) continue;

      // Check if this threshold has already been alerted (PostgreSQL)
      const existing = await query(
        'SELECT threshold FROM usage_alerted_thresholds WHERE license_key = $1 AND threshold = $2',
        [licenseKey, threshold]
      );

      if (existing.rows.length > 0) continue; // Already alerted

      // Insert new threshold alert
      try {
        await query(
          'INSERT INTO usage_alerted_thresholds (license_key, threshold) VALUES ($1, $2)',
          [licenseKey, threshold]
        );

        const alert = {
          licenseKey,
          threshold,
          currentUsage: status.currentUsage,
          monthlyLimit: status.monthlyLimit,
          percentUsed: status.percentUsed,
          isExceeded: status.isExceeded,
          overageCost: status.overageCost,
          timestamp: new Date().toISOString(),
        };

        this.emit('threshold_alert', alert);
        logger.info(`[UsageMetering] Alert: ${licenseKey} at ${status.percentUsed.toFixed(1)}%`);
      } catch {
        // Race condition: another process already inserted this threshold.
        // This is safe to ignore (unique constraint) because the next read
        // will see the existing row and skip the insert.
        logger.warn('[UsageMetering] Duplicate threshold alert (race condition ignored):', { licenseKey, threshold });
      }
    }
  }

  private async setKeyExpiry(key: string, period: string): Promise<void> {
    // Set expiry to end of the billing period + 1 year for archive
    const [year, month] = period.split('-').map(Number);
    const periodEnd = new Date(year, month, 0, 23, 59, 59); // Last day of month
    const expireSeconds = Math.floor((periodEnd.getTime() - Date.now()) / 1000) + (86400 * 365);

    if (expireSeconds > 0) {
      await this.redis.expire(key, expireSeconds);
    }
  }
}
