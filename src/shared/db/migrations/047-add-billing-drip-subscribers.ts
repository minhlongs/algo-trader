/**
 * Migration 047: Add billing drip subscribers table
 * Creates the drip_subscribers table for persistent trial-to-paid email campaign records.
 *
 * This stores subscriber state for automated email drip sequences,
 * enabling conversion tracking and email campaign lifecycle management.
 */
import { PoolClient } from 'pg';

export const id = '047-add-billing-drip-subscribers';
export const description = 'Create drip_subscribers table for trial email campaign persistence';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS drip_subscribers (
      tenant_id VARCHAR(128) PRIMARY KEY,
      email TEXT NOT NULL,
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER')),
      subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trial_ends_at TIMESTAMPTZ NOT NULL,
      days_since_trial_start INTEGER NOT NULL DEFAULT 0,
      last_email_day INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_drip_subscribers_email
    ON drip_subscribers(email)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_drip_subscribers_is_active
    ON drip_subscribers(is_active)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_drip_subscribers_is_active');
  await client.query('DROP INDEX IF EXISTS idx_drip_subscribers_email');
  await client.query('DROP TABLE IF EXISTS drip_subscribers CASCADE');
}
