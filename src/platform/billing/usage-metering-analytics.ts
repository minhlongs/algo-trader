/**
 * Usage Metering — analytics queries (metrics, usage data, revenue summary).
 * Extracted from usage-metering.ts to keep every module under the line limit.
 * Pure functions over a Redis client plus a period resolver; no class state.
 */

import type { RedisClientType } from '../../redis';
import { LicenseTier } from '../../shared/types/license';
import type { UsageMetrics, UsageStatus } from './usage-metering-types';

type PeriodResolver = () => string;

export interface RevenueSummary {
  subscriptionRevenue: number;
  overageRevenue: number;
  totalRevenue: number;
  customerCount: number;
  averageRevenuePerCustomer: number;
}

/**
 * Get usage metrics for a license
 */
export async function getMetrics(
  redis: RedisClientType,
  getCurrentPeriod: PeriodResolver,
  licenseKey: string
): Promise<UsageMetrics> {
  const period = getCurrentPeriod();
  const baseKey = `usage:${licenseKey}:${period}`;

  const [totalTrades, volume] = await Promise.all([
    redis.get(`${baseKey}`),
    redis.get(`${baseKey}:volume`),
  ]);

  const trades = parseInt(totalTrades || '0');
  const totalVolume = parseFloat(volume || '0');

  // Get trade success/failure from detailed logs
  const successKey = `usage:${licenseKey}:${period}:success`;
  const failKey = `usage:${licenseKey}:${period}:failed`;
  const [successful, failed] = await Promise.all([
    redis.get(successKey),
    redis.get(failKey),
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
 * Get all usage data for revenue analytics
 */
export async function getAllUsageData(
  redis: RedisClientType,
  getCurrentPeriod: PeriodResolver,
  period?: string
): Promise<UsageStatus[]> {
  const targetPeriod = period || getCurrentPeriod();
  const pattern = `usage:*:${targetPeriod}`;

  const keys = await redis.keys(pattern);
  const usageData: UsageStatus[] = [];

  for (const key of keys) {
    // Extract license key from pattern usage:<license>:<period>
    const parts = key.split(':');
    if (parts.length >= 3) {
      const licenseKey = parts[1];
      // Tier would need to be looked up from license service
      // For now, return with unknown tier
      const usage = await redis.get(key);
      if (usage) {
        usageData.push({
          licenseKey,
          period: targetPeriod,
          tier: LicenseTier.PRO, // Placeholder
          monthlyLimit: 10000,
          currentUsage: parseInt(usage),
          remaining: 0,
          percentUsed: 0,
          isExceeded: false,
          overageUnits: 0,
          overageCost: 0,
        });
      }
    }
  }

  return usageData;
}

/**
 * Get revenue summary for period
 */
export async function getRevenueSummary(
  redis: RedisClientType,
  getCurrentPeriod: PeriodResolver,
  period?: string
): Promise<RevenueSummary> {
  const usageData = await getAllUsageData(redis, getCurrentPeriod, period);
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
