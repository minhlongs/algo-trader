/**
 * Migration 050: Add billing onboarding signups table
 * Creates the onboarding_signups table for persistent pending signup records.
 *
 * This stores verification-in-progress signup records with TTL tracking,
 * enabling onboarding flow persistence across server restarts.
 */
import { PoolClient } from 'pg';

export const id = '050-add-billing-onboarding-signups';
export const description = 'Create onboarding_signups table for pending signup persistence';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS onboarding_signups (
      pending_id VARCHAR(64) PRIMARY KEY,
      email TEXT NOT NULL,
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER')),
      wallet_address TEXT,
      verification_token VARCHAR(16) NOT NULL,
      expires_at BIGINT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_signups_email
    ON onboarding_signups(email)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_signups_expires_at
    ON onboarding_signups(expires_at)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_onboarding_signups_expires_at');
  await client.query('DROP INDEX IF EXISTS idx_onboarding_signups_email');
  await client.query('DROP TABLE IF EXISTS onboarding_signups CASCADE');
}
