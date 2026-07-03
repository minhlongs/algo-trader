/**
 * Migration 029: Create Tenant Credentials Table
 * Encrypted credential storage per subscriber
 */

import { PoolClient } from 'pg';

export const id = '029-tenant-credentials';
export const description = 'Create tenant credentials table';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenant_credentials (
      subscriber_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      api_secret TEXT NOT NULL,
      passphrase TEXT NOT NULL,
      private_key TEXT NOT NULL,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_tenant_credentials_subscriber_id ON tenant_credentials (subscriber_id)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS tenant_credentials CASCADE');
}
