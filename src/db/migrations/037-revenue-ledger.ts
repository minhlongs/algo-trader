/**
 * Migration 037: Create Revenue Ledger Table
 *
 * Immutable financial ledger for revenue settlements.
 * 80/20 provider/platform split, integer cents arithmetic.
 * Mirrors `marketplace_revenue_shares` but with stricter audit discipline
 * (immutable rows, ARI — append-only, no UPDATE/DELETE).
 */

import { PoolClient } from 'pg';

export const id = '037-revenue-ledger';
export const description =
  'Create revenue_ledger table for immutable 80/20 revenue settlement';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS revenue_ledger (
      id VARCHAR(64) PRIMARY KEY,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      gross_cents INTEGER NOT NULL CHECK (gross_cents >= 0),
      platform_cents INTEGER NOT NULL CHECK (platform_cents >= 0),
      provider_cents INTEGER NOT NULL CHECK (provider_cents >= 0),
      provider_share_bps INTEGER NOT NULL CHECK (provider_share_bps >= 0 AND provider_share_bps <= 10000),
      platform_share_bps INTEGER NOT NULL CHECK (platform_share_bps >= 0 AND platform_share_bps <= 10000),
      status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'void')),
      settled_at TIMESTAMPTZ,
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Guarantee immutability: one row per (period, strategy, subscription)
  await client.query(`
    ALTER TABLE revenue_ledger ADD CONSTRAINT unique_ledger_row UNIQUE (period_start, period_end, strategy_id, subscription_id)
  `);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_revenue_ledger_provider ON revenue_ledger(provider_id, period_start DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_revenue_ledger_strategy ON revenue_ledger(strategy_id, period_start DESC)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_revenue_ledger_status ON revenue_ledger(status)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_revenue_ledger_settled ON revenue_ledger(settled_at DESC) WHERE settled_at IS NOT NULL`,
  );
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS revenue_ledger CASCADE');
}
