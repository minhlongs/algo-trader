/**
 * Migration 044: Add billing payments table
 * Creates the payments table for persistent billing payment records.
 *
 * This stores individual payment transactions linked to subscriptions,
 * enabling payment history tracking and reconciliation.
 */
import { PoolClient } from 'pg';

export const id = '044-add-billing-payments';
export const description = 'Create payments table for persistent billing payment records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(128) PRIMARY KEY,
      provider_payment_id VARCHAR(256) NOT NULL,
      subscription_id VARCHAR(128),
      customer_email TEXT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'USDT',
      status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
      product_id VARCHAR(128),
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_customer_email
    ON payments(customer_email)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id
    ON payments(provider_payment_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_subscription_id
    ON payments(subscription_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_payments_customer_email');
  await client.query('DROP INDEX IF EXISTS idx_payments_provider_payment_id');
  await client.query('DROP INDEX IF EXISTS idx_payments_subscription_id');
  await client.query('DROP INDEX IF EXISTS idx_payments_status');
  await client.query('DROP TABLE IF EXISTS payments CASCADE');
}
