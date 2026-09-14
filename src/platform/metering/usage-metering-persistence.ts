/**
 * Usage Metering Database Persistence.
 * ROIaaS Phase 4 - Daily API usage tracking persistence.
 */

import { LicenseTier } from '../../shared/types/license';
import { query } from '../../shared/db/postgres-client.js';
import type { UsageStatus } from './usage-metering-types';

export async function persistDailyUsage(
  licenseKey: string,
  tier: LicenseTier,
  status: UsageStatus
): Promise<void> {
  try {
    await query(
      `INSERT INTO license_usage_daily (license_key, date, tier, api_calls_count, overage_units, overage_cost)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (license_key, date) DO UPDATE SET
         api_calls_count = $4, overage_units = $5, overage_cost = $6`,
      [licenseKey, status.date, tier, status.currentUsage, status.overageUnits, status.overageCost]
    );
  } catch (_error) {
    // Database errors are non-fatal — usage tracking continues in memory
  }
}
