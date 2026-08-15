/**
 * Migration 045: Create OHLCV Candles Table
 *
 * Stores historical Open-High-Low-Close-Volume candle data for backtesting
 * and analysis. Composite unique index prevents duplicate candles.
 */

import { PoolClient } from 'pg';

export const id = '045-ohlcv-candles';
export const description = 'Create ohlcv_candles table for historical market data';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ohlcv_candles (
      id SERIAL PRIMARY KEY,
      market VARCHAR(128) NOT NULL,
      exchange VARCHAR(64) NOT NULL DEFAULT 'polymarket',
      timeframe VARCHAR(16) NOT NULL DEFAULT '1h',
      timestamp TIMESTAMPTZ NOT NULL,
      open NUMERIC(20, 8) NOT NULL,
      high NUMERIC(20, 8) NOT NULL,
      low NUMERIC(20, 8) NOT NULL,
      close NUMERIC(20, 8) NOT NULL,
      volume NUMERIC(20, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ohlcv_composite
    ON ohlcv_candles (market, exchange, timeframe, timestamp)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ohlcv_market_timeframe
    ON ohlcv_candles (market, timeframe, timestamp DESC)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_ohlcv_market_timeframe');
  await client.query('DROP INDEX IF EXISTS idx_ohlcv_composite');
  await client.query('DROP TABLE IF EXISTS ohlcv_candles');
}
