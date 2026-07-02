/**
 * Migration 041: Subscription Improvements
 * Adds auto-renewal flag, billing details, and usage tracking to marketplace subscriptions.
 */
import { PoolClient } from 'pg';

export const id = '041-add-subscription-improvements';
export const description = 'Add auto_renew, billing, usage tracking to marketplace_subscriptions';

export async function up(client: PoolClient): Promise<void> {
  // Add auto_renew and billing columns to marketplace_subscriptions
  await client.query(`
    ALTER TABLE marketplace_subscriptions
    ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_billing_period_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_billing_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_signals_delivered INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_execution_errors INTEGER NOT NULL DEFAULT 0
  `);

  // Create subscription status history table
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_status_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      previous_status VARCHAR(32),
      new_status VARCHAR(32) NOT NULL,
      reason TEXT,
      changed_by TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sub_status_history_subscription
    ON subscription_status_history(subscription_id, created_at DESC)
  `);

  // Create subscription usage snapshot table for periodic tracking
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_usage_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
      signals_delivered INTEGER NOT NULL DEFAULT 0,
      execution_errors INTEGER NOT NULL DEFAULT 0,
      allocation_percent DECIMAL(5,2) NOT NULL,
      current_investment_usd INTEGER NOT NULL DEFAULT 0,
      total_pnl_usd INTEGER NOT NULL DEFAULT 0,
      pnl_today_usd INTEGER NOT NULL DEFAULT 0,
      win_rate_today DECIMAL(5,2),
      trades_today INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(subscription_id, snapshot_date)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usage_snapshots_tenant
    ON subscription_usage_snapshots(tenant_id, snapshot_date DESC)
  `);

  // Seed initial billing periods for existing active subscriptions
  await client.query(`
    UPDATE marketplace_subscriptions
    SET
      current_billing_period_start = subscription_started_at,
      current_billing_period_end = subscription_started_at + INTERVAL '30 days',
      next_billing_date = subscription_started_at + INTERVAL '30 days'
    WHERE status = 'active' AND next_billing_date IS NULL
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS subscription_usage_snapshots CASCADE');
  await client.query('DROP TABLE IF EXISTS subscription_status_history CASCADE');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS auto_renew');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS next_billing_date');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS current_billing_period_start');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS current_billing_period_end');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS total_signals_delivered');
  await client.query('ALTER TABLE marketplace_subscriptions DROP COLUMN IF EXISTS total_execution_errors');
}
