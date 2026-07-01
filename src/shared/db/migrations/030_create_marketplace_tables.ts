/**
 * Migration 025: Create Marketplace Strategy Submission Tables
 * Supports strategy publishing, vetting workflow, and listings
 */

import { PoolClient } from 'pg';

export const id = '025_create_marketplace_tables';
export const description = 'Create marketplace strategy submission and listing tables';

export async function up(client: PoolClient): Promise<void> {
  // Marketplace Strategies table
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_strategies (
      id VARCHAR(64) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(32) NOT NULL CHECK (category IN ('arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other')),
      status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_vetting', 'approved', 'rejected', 'suspended')),
      risk_level INTEGER NOT NULL CHECK (risk_level >= 1 AND risk_level <= 10),
      min_allocation_usd INTEGER NOT NULL,
      max_allocation_usd INTEGER NOT NULL,
      supported_exchanges TEXT[] DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      backtest_sharpe DECIMAL(8, 4),
      backtest_max_drawdown DECIMAL(8, 4),
      backtest_win_rate DECIMAL(8, 4),
      backtest_period_days INTEGER,
      backtest_total_trades INTEGER,
      backtest_total_pnl_usd DECIMAL(18, 8),
      backtest_profit_factor DECIMAL(8, 4),
      vetted_at TIMESTAMPTZ,
      vetted_by TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Marketplace Listings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id VARCHAR(64) PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      price_usd_monthly INTEGER NOT NULL DEFAULT 0,
      billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
      risk_limits JSONB NOT NULL DEFAULT '{"maxDailyLossPercent": 10, "maxPositionSizePercent": 20, "stopLossPercent": 5, "maxConcurrentTrades": 5}',
      allowed_tenants TEXT[] DEFAULT '{}',
      excluded_tenants TEXT[] DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT false,
      subscriber_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Vetting History table (audit trail)
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_vetting_history (
      id SERIAL PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      admin_id TEXT NOT NULL,
      decision VARCHAR(32) NOT NULL CHECK (decision IN ('approve', 'reject', 'request_changes')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes for performance
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_status ON marketplace_strategies(status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_category ON marketplace_strategies(category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_tenant_id ON marketplace_strategies(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_creator_id ON marketplace_strategies(creator_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_strategies_approved_risk ON marketplace_strategies(status, risk_level) WHERE status = 'approved'`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_strategy_id ON marketplace_listings(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_tenant_id ON marketplace_listings(tenant_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active ON marketplace_listings(is_active) WHERE is_active = true`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_vetting_history_strategy_id ON marketplace_vetting_history(strategy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_vetting_history_created_at ON marketplace_vetting_history(created_at)`);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS marketplace_vetting_history CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_listings CASCADE');
  await client.query('DROP TABLE IF EXISTS marketplace_strategies CASCADE');
}
