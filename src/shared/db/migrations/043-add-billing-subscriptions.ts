/**
 * Migration 043: Add billing subscriptions table
 * Creates the subscriptions table for persistent billing subscription records.
 *
 * This stores subscription data linked to payment providers, enabling
 * subscription lifecycle management across the platform.
 */
import { PoolClient } from 'pg';

export const id = '043-add-billing-subscriptions';
export const description = 'Create subscriptions table for persistent billing subscription records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(128) PRIMARY KEY,
      provider_payment_id VARCHAR(256) NOT NULL,
      customer_email TEXT NOT NULL,
      product_id VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE', 'MASTER')),
      current_period_start TIMESTAMPTZ NOT NULL,
      current_period_end TIMESTAMPTZ NOT NULL,
      amount DECIMAL(12,2),
      currency VARCHAR(16) DEFAULT 'USDT',
      license_id VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_email
    ON subscriptions(customer_email)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_payment_id
    ON subscriptions(provider_payment_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON subscriptions(status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_subscriptions_customer_email');
  await client.query('DROP INDEX IF EXISTS idx_subscriptions_provider_payment_id');
  await client.query('DROP INDEX IF EXISTS idx_subscriptions_status');
  await client.query('DROP TABLE IF EXISTS subscriptions CASCADE');
}
