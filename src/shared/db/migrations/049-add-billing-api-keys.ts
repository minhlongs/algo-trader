/**
 * Migration 049: Add billing api keys table
 * Creates the api_keys table for persistent API key records.
 *
 * This stores hashed API keys with license linkage and lifecycle tracking.
 * Security: only SHA-256 hashes are stored; plaintext keys are never persisted.
 */
import { PoolClient } from 'pg';

export const id = '049-add-billing-api-keys';
export const description = 'Create api_keys table for persistent API key records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(128) PRIMARY KEY,
      key_hash VARCHAR(256) NOT NULL,
      key_prefix VARCHAR(16) NOT NULL,
      license_id VARCHAR(128) NOT NULL,
      created_at BIGINT NOT NULL,
      last_used_at BIGINT,
      revoked_at BIGINT,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_license_id
    ON api_keys(license_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
    ON api_keys(key_hash)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
    ON api_keys(is_active)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_api_keys_is_active');
  await client.query('DROP INDEX IF EXISTS idx_api_keys_key_hash');
  await client.query('DROP INDEX IF EXISTS idx_api_keys_license_id');
  await client.query('DROP TABLE IF EXISTS api_keys CASCADE');
}
