/**
 * Migration 031: Add payment tracking to marketplace_subscriptions
 * Enables NOWPayments checkout flow for strategy subscriptions
 */
import { PoolClient } from 'pg';

export const id = '031-add-marketplace-subscription-payment';
export const description = 'Add payment_id and payment_status columns to marketplace_subscriptions';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE marketplace_subscriptions
      ADD COLUMN IF NOT EXISTS payment_id TEXT,
      ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded', 'expired'))
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_payment_id
      ON marketplace_subscriptions(payment_id) WHERE payment_id IS NOT NULL
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE marketplace_subscriptions
      DROP COLUMN IF EXISTS payment_status,
      DROP COLUMN IF EXISTS payment_id
  `);
}
