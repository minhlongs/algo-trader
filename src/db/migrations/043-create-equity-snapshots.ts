/**
 * Migration 043: Create equity_snapshots table
 *
 * Records periodic equity snapshots for historical drawdown analysis,
 * VaR backtesting, and equity curve visualization.
 */
import { PoolClient } from 'pg';

export const id = '043-create-equity-snapshots';
export const description = 'Create equity_snapshots table for portfolio equity tracking';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS equity_snapshots (
      id SERIAL PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      total_equity DECIMAL(18,6) NOT NULL,
      cash_balance DECIMAL(18,6) NOT NULL DEFAULT 0,
      unrealized_pnl DECIMAL(18,6) NOT NULL DEFAULT 0,
      realized_pnl_daily DECIMAL(18,6) NOT NULL DEFAULT 0,
      open_positions INT NOT NULL DEFAULT 0,
      drawdown_pct DECIMAL(8,6) NOT NULL DEFAULT 0,
      metadata JSONB DEFAULT '{}'
    )
  `);

  // Index for time-range queries (VaR lookback, equity curve)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_equity_snapshots_timestamp
    ON equity_snapshots (timestamp DESC)
  `);

  // Index for daily aggregation queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_equity_snapshots_daily
    ON equity_snapshots ((timestamp / 86400000))
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS equity_snapshots');
}
