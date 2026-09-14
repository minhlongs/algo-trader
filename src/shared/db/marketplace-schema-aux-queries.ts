/**
 * Marketplace schema migration 025: Auxiliary table DDL queries and teardown (shared).
 * Tables: marketplace_performance, marketplace_reviews, marketplace_revenue_shares, marketplace_disputes.
 */

import type { PoolClient } from 'pg';

export async function createMarketplaceAuxTables(client: PoolClient): Promise<void> {
  // ==================== marketplace_performance ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_performance (
      id SERIAL PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT,
      date DATE NOT NULL,
      sharpe_ratio DECIMAL(8,4),
      max_drawdown DECIMAL(8,4),
      total_pnl_usd INTEGER NOT NULL DEFAULT 0,
      win_rate DECIMAL(5,2),
      total_trades INTEGER NOT NULL DEFAULT 0,
      winning_trades INTEGER NOT NULL DEFAULT 0,
      losing_trades INTEGER NOT NULL DEFAULT 0,
      avg_win_usd INTEGER,
      avg_loss_usd INTEGER,
      profit_factor DECIMAL(8,4),
      volatility DECIMAL(8,4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(strategy_id, tenant_id, date)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_performance_strategy_id ON marketplace_performance(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_performance_date ON marketplace_performance(date DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_performance_tenant ON marketplace_performance(tenant_id) WHERE tenant_id IS NOT NULL`);

  // ==================== marketplace_reviews ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_reviews (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      is_verified BOOLEAN NOT NULL DEFAULT true,
      helpful_votes INTEGER NOT NULL DEFAULT 0,
      reported_count INTEGER NOT NULL DEFAULT 0,
      is_flagged BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, strategy_id),
      UNIQUE(subscription_id)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_strategy_id ON marketplace_reviews(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_tenant_id ON marketplace_reviews(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_rating ON marketplace_reviews(strategy_id, rating)`);

  // ==================== marketplace_revenue_shares ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_revenue_shares (
      id VARCHAR(64) PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      gross_revenue_cents INTEGER NOT NULL,
      platform_share_cents INTEGER NOT NULL,
      creator_share_cents INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
      paid_at TIMESTAMPTZ,
      stripe_payout_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(strategy_id, tenant_id, period_start, period_end)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_shares_strategy_id ON marketplace_revenue_shares(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_shares_tenant_id ON marketplace_revenue_shares(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_shares_period ON marketplace_revenue_shares(period_start, period_end)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_shares_status ON marketplace_revenue_shares(status)`);

  // ==================== marketplace_disputes ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_disputes (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
      reason VARCHAR(64) NOT NULL CHECK (reason IN ('performance_not_as_described', 'unauthorized_charges', 'poor_support', 'strategy_broken', 'other')),
      description TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed')),
      resolution TEXT,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      compensation_amount_cents INTEGER,
      compensation_type VARCHAR(32),
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_tenant_id ON marketplace_disputes(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_listing_id ON marketplace_disputes(listing_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_status ON marketplace_disputes(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_created ON marketplace_disputes(created_at DESC)`);
}

export async function dropMarketplaceTables(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS marketplace_disputes CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_revenue_shares CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_reviews CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_performance CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_subscriptions CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_listings CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_strategies CASCADE');
}
