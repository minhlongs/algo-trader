/**
 * Migration 039: API Keys Table
 * Self-service API key management for PRO+ tenants.
 * Keys are hashed on storage, shown once at creation.
 */
import { PoolClient } from 'pg';

export const id = '039-add-api-keys';
export const description = 'Create api_keys table for developer key management';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      label VARCHAR(100) NOT NULL,
      key_prefix VARCHAR(8) NOT NULL,
      key_hash TEXT NOT NULL,
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_active
    ON api_keys(tenant_id)
    WHERE revoked_at IS NULL
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS api_keys CASCADE');
}
