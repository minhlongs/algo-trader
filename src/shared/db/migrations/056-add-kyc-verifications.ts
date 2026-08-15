/**
 * Migration 056: Create kyc_verifications table
 * Stores Persona verification status per tenant for compliance auditing.
 * Phase 35 — BYOK KYC for PRO+ tiers.
 */
import { PoolClient } from 'pg';

export const id = '056-add-kyc-verifications';
export const description = 'Create kyc_verifications table for identity verification tracking';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS kyc_verifications (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'persona',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'expired')),
      verification_level TEXT NOT NULL DEFAULT 'basic'
        CHECK (verification_level IN ('basic', 'advanced', 'full')),
      provider_reference TEXT,
      provider_account_id TEXT,
      verified_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_kyc_verifications_tenant_status
    ON kyc_verifications(tenant_id, status)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_kyc_verifications_provider_ref
    ON kyc_verifications(provider_reference)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_kyc_verifications_provider_ref');
  await client.query('DROP INDEX IF EXISTS idx_kyc_verifications_tenant_status');
  await client.query('DROP TABLE IF EXISTS kyc_verifications CASCADE');
}
