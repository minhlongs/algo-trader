/**
 * Migration 049: Create Funding Rates Table
 *
 * Stores historical funding rate data from Binance Futures for alpha research.
 * Composite unique index prevents duplicate funding events.
 */

import { PoolClient } from 'pg';

export const id = '049-funding-rates';
export const description = 'Create funding_rates table for Binance Futures funding history';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS funding_rates (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL,
      exchange VARCHAR(64) NOT NULL DEFAULT 'binance-futures',
      funding_time TIMESTAMPTZ NOT NULL,
      funding_rate NUMERIC(20,12) NOT NULL,
      mark_price NUMERIC(20,8),
      rate_type VARCHAR(24),
      retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_url TEXT NOT NULL DEFAULT 'https://fapi.binance.com/fapi/v1/fundingRate'
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_composite
    ON funding_rates (symbol, exchange, funding_time)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_funding_symbol_time
    ON funding_rates (symbol, exchange, funding_time DESC)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_funding_symbol_time');
  await client.query('DROP INDEX IF EXISTS idx_funding_composite');
  await client.query('DROP TABLE IF EXISTS funding_rates');
}