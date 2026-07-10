/**
 * Migration 035: Create Multi-Tenant Core Tables
 *
 * Adds:
 *   - tenants: tenant registration with plan/status/settings
 *   - providers: publisher identities linked to tenants
 *
 * Phase 1 of marketplace & multi-tenant monetization.
 */

import { PoolClient } from 'pg';

export const id = '035-multi-tenant-core-tables';
export const description =
  'Create tenants and providers tables for multi-tenant marketplace';

export async function up(client: PoolClient): Promise<void> {
  // ==================== tenants ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(64) NOT NULL UNIQUE,
      plan VARCHAR(32) NOT NULL DEFAULT 'free',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      settings JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)`,
  );

  // ==================== providers ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS providers (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      bio TEXT,
      payout_address TEXT,
      verified_at TIMESTAMPTZ,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id)
    )
  `);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON providers(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_providers_user_id ON providers(user_id)`,
  );
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS providers CASCADE');
  await client.query('DROP TABLE IF EXISTS tenants CASCADE');
}
