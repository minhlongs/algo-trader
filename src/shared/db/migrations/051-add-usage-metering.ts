/**
 * Migration 051: Add usage metering tables
 * Creates usage_records and usage_alerted_thresholds tables for persistent billing usage tracking.
 *
 * This stores usage summary records for billing periods and alerted threshold tracking,
 * enabling overage charge calculation and usage-based alerting.
 */
import { PoolClient } from 'pg';

export const id = '051-add-usage-metering';
export const description = 'Create usage_records and usage_alerted_thresholds tables for usage metering persistence';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id VARCHAR(128) PRIMARY KEY,
      license_key VARCHAR(256) NOT NULL,
      period VARCHAR(16) NOT NULL,
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER')),
      total_trades INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      total_volume DECIMAL(20,8) NOT NULL DEFAULT 0,
      monthly_limit INTEGER NOT NULL DEFAULT 1000,
      overage_units INTEGER NOT NULL DEFAULT 0,
      overage_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS usage_alerted_thresholds (
      license_key VARCHAR(256) NOT NULL,
      threshold INTEGER NOT NULL,
      alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (license_key, threshold)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_records_license_key
    ON usage_records(license_key)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_records_period
    ON usage_records(period)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_records_license_period
    ON usage_records(license_key, period)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_usage_records_license_period');
  await client.query('DROP INDEX IF EXISTS idx_usage_records_period');
  await client.query('DROP INDEX IF EXISTS idx_usage_records_license_key');
  await client.query('DROP TABLE IF EXISTS usage_alerted_thresholds CASCADE');
  await client.query('DROP TABLE IF EXISTS usage_records CASCADE');
}
