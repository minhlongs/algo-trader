/**
 * Usage Metering Trade Tracking
 * Write-side trade tracking (counter increments, threshold alerts, key
 * expiry, period reset) for the usage metering service. Extracted from
 * usage-metering.ts; the service class delegates to these functions.
 * Behavior is unchanged.
 */

import type { RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { LicenseTier } from '../../shared/types/license';
import { ALERT_THRESHOLDS, type UsageStatus } from './usage-metering-types';

export interface TrackTradeParams {
  redis: RedisClientType;
  alertedThresholds: Map<string, Set<number>>;
  getCurrentPeriod: () => string;
  getUsageStatus: (licenseKey: string, tier: LicenseTier, cachedUsage?: number) => UsageStatus;
  emit: (event: string, payload: unknown) => unknown;
}

/**
 * Track a trade for usage metering
 */
export async function trackTrade(
  params: TrackTradeParams,
  licenseKey: string,
  tier: LicenseTier,
  tradeVolume?: number
): Promise<UsageStatus> {
  const { redis, getCurrentPeriod, getUsageStatus, emit } = params;
  const period = getCurrentPeriod();
  const usageKey = `usage:${licenseKey}:${period}`;

  // Increment usage counter
  const newUsage = await redis.incr(usageKey);

  // Set expiry to end of period
  await setKeyExpiry(redis, usageKey, period);

  // Track volume if provided
  if (tradeVolume) {
    const volumeKey = `usage:${licenseKey}:${period}:volume`;
    await redis.incrbyfloat(volumeKey, tradeVolume);
    await setKeyExpiry(redis, volumeKey, period);
  }

  // Get updated status
  const status = getUsageStatus(licenseKey, tier, newUsage);

  // Check thresholds and emit alerts
  checkThresholds(params, licenseKey, status);

  // Emit trade event
  emit('trade_tracked', {
    licenseKey,
    period,
    usage: newUsage,
    volume: tradeVolume,
    timestamp: Date.now(),
  });

  return status;
}

function checkThresholds(
  params: TrackTradeParams,
  licenseKey: string,
  status: UsageStatus
): void {
  const { alertedThresholds, emit } = params;
  if (!alertedThresholds.has(licenseKey)) {
    alertedThresholds.set(licenseKey, new Set());
  }
  const alerted = alertedThresholds.get(licenseKey)!;

  for (const threshold of ALERT_THRESHOLDS) {
    if (status.percentUsed >= threshold && !alerted.has(threshold)) {
      alerted.add(threshold);

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

      emit('threshold_alert', alert);
      logger.info(`[UsageMetering] Alert: ${licenseKey} at ${status.percentUsed.toFixed(1)}%`);
    }
  }
}

/**
 * Reset usage for new period (called at period boundary)
 */
export async function resetForNewPeriod(
  redis: RedisClientType,
  alertedThresholds: Map<string, Set<number>>,
  getCurrentPeriod: () => string,
  licenseKey: string
): Promise<void> {
  const oldPeriod = getCurrentPeriod();
  const archiveKey = `usage:${licenseKey}:${oldPeriod}:archive`;

  // Archive current usage before reset
  const currentUsage = await redis.get(`usage:${licenseKey}:${oldPeriod}`);
  if (currentUsage) {
    await redis.set(archiveKey, currentUsage);
    await redis.expire(archiveKey, 86400 * 365); // Keep archive for 1 year
  }

  // Clear alerted thresholds
  alertedThresholds.delete(licenseKey);

  logger.info(`[UsageMetering] Reset for ${licenseKey}, archived ${currentUsage} trades`);
}

async function setKeyExpiry(redis: RedisClientType, key: string, period: string): Promise<void> {
  // Set expiry to end of the billing period + 1 year for archive
  const [year, month] = period.split('-').map(Number);
  const periodEnd = new Date(year, month, 0, 23, 59, 59); // Last day of month
  const expireSeconds = Math.floor((periodEnd.getTime() - Date.now()) / 1000) + (86400 * 365);

  if (expireSeconds > 0) {
    await redis.expire(key, expireSeconds);
  }
}
