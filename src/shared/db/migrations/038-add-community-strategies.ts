/**
 * Migration 038: Community Strategies Table
 * Phase 38 Marketplace — community-uploaded strategies with sandbox backtesting.
 */
import { PoolClient } from 'pg';

export const id = '038-add-community-strategies';
export const description =
  'Create community_strategies table for user-uploaded trading strategies';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS community_strategies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      strategy_type TEXT NOT NULL DEFAULT 'polymarket' CHECK (strategy_type IN ('polymarket','cex','dex','custom')),
      source_code TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'typescript' CHECK (language IN ('typescript','javascript')),
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','archived')),
      sandbox_status TEXT CHECK (sandbox_status IS NULL OR sandbox_status IN ('pending','running','passed','failed')),
      backtest_result JSONB,
      review_notes TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_community_strategies_tenant ON community_strategies(tenant_id, created_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_community_strategies_status ON community_strategies(status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS community_strategies');
}
