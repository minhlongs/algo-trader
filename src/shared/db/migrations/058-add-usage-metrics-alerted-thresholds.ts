/**
 * Migration 058: Track which usage thresholds have already alerted.
 *
 * The threshold meter that this replaces kept `alertedThresholds` in a
 * process-local `Set`. That set died with the process, so every restart
 * re-sent the same "80% used" email to the same customer, and a customer whose
 * row survived the restart got an alert the metering code believed was new.
 *
 * The alerted thresholds now live on the same `usage_metrics` row as the count
 * that gates and bills the request, so the alert bookkeeping is durable and
 * idempotent per subscriber per period.
 */
import { PoolClient } from 'pg';

export const id = '058-add-usage-metrics-alerted-thresholds';
export const description = 'Persist alerted usage thresholds on the usage_metrics row';

export async function up(client: PoolClient): Promise<void> {
  // JSONB keeps the three thresholds as one column rather than three sparse
  // booleans, and ADD COLUMN IF NOT EXISTS keeps the migration re-runnable.
  await client.query(`
    ALTER TABLE usage_metrics
      ADD COLUMN IF NOT EXISTS alerted_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE usage_metrics
      DROP COLUMN IF EXISTS alerted_thresholds
  `);
}
