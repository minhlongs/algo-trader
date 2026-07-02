/**
 * Migration 036: KYC Verifications Table
 * Phase 35 Compliance — BYOK identity verification (Persona-compatible).
 */
import { PoolClient } from 'pg';

export const id = '036-add-kyc-verifications';
export const description =
  'Create kyc_verifications table for BYOK identity verification';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS kyc_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'persona',
      provider_account_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','approved','rejected','expired')),
      verification_level TEXT NOT NULL DEFAULT 'basic' CHECK (verification_level IN ('basic','advanced','full')),
      provider_reference TEXT,
      result JSONB,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_kyc_verifications_tenant ON kyc_verifications(tenant_id, created_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS kyc_verifications');
}
