/**
 * Usage Metering — payment-provider usage sync.
 * Extracted from usage-metering.ts to keep every module under the line limit.
 * Dependencies are injected explicitly so this module never imports the class.
 */

import type { RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { LicenseTier } from '../../shared/types/license';
import type { UsageMetrics, UsageStatus } from './usage-metering-types';

export interface SyncUsageDeps {
  redis: RedisClientType;
  nowPaymentsConfigured: boolean;
  getUsageStatus: (licenseKey: string, tier: LicenseTier) => UsageStatus;
  getMetrics: (licenseKey: string) => Promise<UsageMetrics>;
  emit: (event: string, data: Record<string, unknown>) => boolean;
}

/**
 * Sync usage data with payment provider
 */
export async function syncUsage(
  deps: SyncUsageDeps,
  licenseKey: string,
  tier: LicenseTier
): Promise<boolean> {
  if (!deps.nowPaymentsConfigured) {
    logger.warn('[UsageMetering] NowPaymentsService not configured, skipping sync');
    return false;
  }

  try {
    const status = deps.getUsageStatus(licenseKey, tier);
    const metrics = await deps.getMetrics(licenseKey);

    // Prepare usage data for sync
    const usageData = {
      licenseKey,
      period: status.period,
      totalTrades: metrics.totalTrades,
      monthlyLimit: status.monthlyLimit,
      percentUsed: status.percentUsed,
      overageUnits: status.overageUnits,
      overageCost: status.overageCost,
      syncedAt: Date.now(),
    };

    // Store sync timestamp
    await deps.redis.hset(`usage:${licenseKey}:sync`, {
      lastPeriod: status.period,
      lastSyncedAt: Date.now().toString(),
      lastUsage: JSON.stringify(usageData),
    });

    logger.info(`[UsageMetering] Synced usage for ${licenseKey}: ${metrics.totalTrades} trades`);

    deps.emit('usage_sync', usageData);
    return true;
  } catch (error) {
    logger.error('[UsageMetering] Usage sync failed:', { error });
    return false;
  }
}
