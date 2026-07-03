/**
 * Migration 045: Add billing licenses table
 * Creates the licenses table for persistent billing license records.
 *
 * This stores software license keys linked to subscriptions and tenants,
 * enabling license lifecycle management and usage tracking.
 */
import { PoolClient } from 'pg';

export const id = '045-add-billing-licenses';
export const description = 'Create licenses table for persistent billing license records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id VARCHAR(128) PRIMARY KEY,
      name TEXT NOT NULL,
      key VARCHAR(256) NOT NULL UNIQUE,
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER')),
      status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked')),
      usage_count INTEGER NOT NULL DEFAULT 0,
      max_usage INTEGER,
      user_id VARCHAR(128),
      tenant_id VARCHAR(128),
      domain TEXT,
      subscription_id VARCHAR(128),
      overage_units INTEGER DEFAULT 0,
      overage_allowed BOOLEAN DEFAULT false,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_licenses_tenant_id
    ON licenses(tenant_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_licenses_subscription_id
    ON licenses(subscription_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_licenses_status
    ON licenses(status)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_licenses_tier
    ON licenses(tier)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_licenses_tenant_id');
  await client.query('DROP INDEX IF EXISTS idx_licenses_subscription_id');
  await client.query('DROP INDEX IF EXISTS idx_licenses_status');
  await client.query('DROP INDEX IF EXISTS idx_licenses_tier');
  await client.query('DROP TABLE IF EXISTS licenses CASCADE');
}
