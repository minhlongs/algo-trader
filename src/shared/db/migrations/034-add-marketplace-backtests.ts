/**
 * Migration 034: Add Marketplace Backtests Table
 *
 * Stores backtest results for strategies — computed Sharpe, max drawdown,
 * win rate, equity curve. Separate from marketplace_performance (daily snapshots).
 */
import { PoolClient } from 'pg';

export const id = '034-add-marketplace-backtests';
export const description =
  'Create marketplace_backtests table for strategy backtest results';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketplace_backtests (
      id VARCHAR(64) PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      sharpe_ratio DECIMAL(8,4),
      max_drawdown DECIMAL(8,4),
      win_rate DECIMAL(5,2),
      total_pnl_usd INTEGER NOT NULL DEFAULT 0,
      profit_factor DECIMAL(8,4),
      total_trades INTEGER NOT NULL DEFAULT 0,
      winning_trades INTEGER NOT NULL DEFAULT 0,
      losing_trades INTEGER NOT NULL DEFAULT 0,
      avg_win_usd INTEGER,
      avg_loss_usd INTEGER,
      volatility DECIMAL(8,4),
      equity_curve JSONB,
      total_return DECIMAL(8,4),
      initial_capital_usd INTEGER NOT NULL DEFAULT 10000,
      config JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_backtests_strategy_id
    ON marketplace_backtests(strategy_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_backtests_tenant_id
    ON marketplace_backtests(tenant_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_backtests_created
    ON marketplace_backtests(created_at DESC)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS marketplace_backtests CASCADE');
}
