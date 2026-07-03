/**
 * Migration 052: Add STARTER tier and billing_interval column
 *
 * 1. Expands subscriptions tier CHECK constraint to include 'STARTER'
 * 2. Adds billing_interval column to subscriptions (monthly | annual)
 * 3. Expands onboarding_signups tier CHECK constraint to include 'STARTER'
 */
import { PoolClient } from 'pg';

export const id = '052-add-starter-tier-and-billing-interval';
export const description = 'Add STARTER tier support and billing_interval column for annual billing';

export async function up(client: PoolClient): Promise<void> {
  // Step 1: Expand subscriptions tier CHECK constraint to include STARTER
  // Drop the old constraint and recreate with STARTER
  await client.query(`
    ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_tier_check
  `);

  await client.query(`
    ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_tier_check
    CHECK (tier IN ('FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'))
  `);

  // Step 2: Add billing_interval column with default 'monthly'
  await client.query(`
    ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(16) NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual'))
  `);

  // Step 3: Add index on billing_interval for billing operations
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_interval
    ON subscriptions(billing_interval)
  `);

  // Step 4: Expand onboarding_signups tier CHECK constraint
  await client.query(`
    ALTER TABLE onboarding_signups
    DROP CONSTRAINT IF EXISTS onboarding_signups_tier_check
  `);

  await client.query(`
    ALTER TABLE onboarding_signups
    ADD CONSTRAINT onboarding_signups_tier_check
    CHECK (tier IN ('FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'))
  `);
}

export async function down(client: PoolClient): Promise<void> {
  // Revert subscriptions tier check
  await client.query(`
    ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_tier_check
  `);
  await client.query(`
    ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_tier_check
    CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER'))
  `);

  // Remove billing_interval column
  await client.query(`
    DROP INDEX IF EXISTS idx_subscriptions_billing_interval
  `);
  await client.query(`
    ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS billing_interval
  `);

  // Revert onboarding_signups tier check
  await client.query(`
    ALTER TABLE onboarding_signups
    DROP CONSTRAINT IF EXISTS onboarding_signups_tier_check
  `);
  await client.query(`
    ALTER TABLE onboarding_signups
    ADD CONSTRAINT onboarding_signups_tier_check
    CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER'))
  `);
}
