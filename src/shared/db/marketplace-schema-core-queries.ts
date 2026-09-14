/**
 * Marketplace schema migration 025: Core table DDL queries (shared).
 * Tables: marketplace_strategies, marketplace_listings, marketplace_subscriptions.
 */

import type { PoolClient } from 'pg';

export async function createMarketplaceCoreTables(client: PoolClient): Promise<void> {
  // ==================== marketplace_strategies ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_strategies (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_vetting', 'approved', 'rejected', 'suspended')),
      risk_level INTEGER NOT NULL CHECK (risk_level >= 1 AND risk_level <= 10),
      min_allocation_usd INTEGER NOT NULL DEFAULT 100,
      max_allocation_usd INTEGER NOT NULL DEFAULT 100000,
      supported_exchanges TEXT[],
      tags TEXT[],
      backtest_summary JSONB,
      vetted_at TIMESTAMPTZ,
      vetted_by TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_tenant_id ON marketplace_strategies(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_status ON marketplace_strategies(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_category ON marketplace_strategies(category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_creator_id ON marketplace_strategies(creator_id)`);

  // ==================== marketplace_listings ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id VARCHAR(64) PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      price_usd_monthly INTEGER NOT NULL,
      billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
      risk_limits JSONB NOT NULL DEFAULT '{
        "max_daily_loss_percent": 5.0,
        "max_position_size_percent": 10.0,
        "stop_loss_percent": 2.0,
        "max_concurrent_trades": 5
      }',
      allowed_tenants TEXT[],
      excluded_tenants TEXT[],
      is_active BOOLEAN NOT NULL DEFAULT true,
      subscriber_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_strategy_id ON marketplace_listings(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_tenant_id ON marketplace_listings(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active ON marketplace_listings(is_active) WHERE is_active = true`);

  // ==================== marketplace_subscriptions ====================
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'suspended')),
      allocation_percent DECIMAL(5,2) NOT NULL CHECK (allocation_percent > 0 AND allocation_percent <= 100),
      custom_risk_limits JSONB,
      current_investment_usd INTEGER NOT NULL DEFAULT 0,
      total_pnl_usd INTEGER DEFAULT 0,
      subscription_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paused_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, listing_id)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_tenant_id ON marketplace_subscriptions(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_strategy_id ON marketplace_subscriptions(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_status ON marketplace_subscriptions(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_active ON marketplace_subscriptions(tenant_id, status) WHERE status = 'active'`);
}
