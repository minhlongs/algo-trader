/**
 * Migration 057: Add usage_metrics table
 * Creates the durable per-subscriber usage counter read and written by
 * UsageMeteringService (src/platform/signals-api/usage-metering-service-core.ts).
 *
 * Before this migration existed, `recordCall` INSERTed into a table no migration
 * created: the statement failed, the error was swallowed by the service's catch,
 * and `getPeriodUsage` returned 0 — so the quota gate always reported budget
 * remaining. This table makes both the allowance decision and the billing count
 * read the same row.
 *
 * Columns mirror exactly what the service selects and inserts; no speculative
 * columns are added here.
 */
import { PoolClient } from 'pg';

export const id = '057-add-usage-metrics-table';
export const description = 'Create usage_metrics table for durable per-subscriber quota metering';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS usage_metrics (
      id VARCHAR(160) PRIMARY KEY,
      subscriber_id VARCHAR(128) NOT NULL,
      period VARCHAR(16) NOT NULL,
      calls_today INTEGER NOT NULL DEFAULT 0,
      calls_this_period INTEGER NOT NULL DEFAULT 0,
      trades_this_period INTEGER NOT NULL DEFAULT 0,
      trade_volume DECIMAL(20,8) NOT NULL DEFAULT 0,
      period_limit INTEGER NOT NULL DEFAULT 1000,
      overage_calls INTEGER NOT NULL DEFAULT 0,
      last_reset_at BIGINT,
      updated_at BIGINT NOT NULL DEFAULT 0,
      CONSTRAINT usage_metrics_subscriber_period_unique UNIQUE (subscriber_id, period)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_subscriber_period
    ON usage_metrics(subscriber_id, period)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_period
    ON usage_metrics(period)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_usage_metrics_period');
  await client.query('DROP INDEX IF EXISTS idx_usage_metrics_subscriber_period');
  await client.query('DROP TABLE IF EXISTS usage_metrics CASCADE');
}
