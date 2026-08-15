/**
 * Migration 044: Create Onboarding Signups Table
 *
 * Persists pending signup data (email, verification code, tier selection)
 * and activated signups (license key, activated_at). Replaces in-memory
 * Map in onboarding-service.ts so data survives process restarts.
 */

import { PoolClient } from 'pg';

export const id = '044-onboarding-signups';
export const description =
  'Create onboarding_signups table for persistent signup/activation flow';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS onboarding_signups (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      tier VARCHAR(32) NOT NULL DEFAULT 'free',
      status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'activated', 'expired')),
      verification_code VARCHAR(8),
      license_key VARCHAR(128),
      activated_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_email_pending
     ON onboarding_signups(email)
     WHERE status = 'pending'`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_signups(status)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_onboarding_expires ON onboarding_signups(expires_at)
     WHERE status = 'pending'`,
  );
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS onboarding_signups');
}
