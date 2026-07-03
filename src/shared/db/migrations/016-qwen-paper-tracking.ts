/**
 * Migration 016: Qwen paper-trading tracking
 * Phase 04 — paper-gate + rollback harness
 */

import { PoolClient } from 'pg';

export const id = '016-qwen-paper-tracking';
export const description = 'Add source column to signals and create paper_trades_v3 table';

export async function up(client: PoolClient): Promise<void> {
  await client.query("ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy'");
  await client.query('ALTER TABLE signals ADD COLUMN IF NOT EXISTS paper_only INTEGER NOT NULL DEFAULT 0');
  await client.query('CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source, ts DESC)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS paper_trades_v3 (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      side            TEXT NOT NULL CHECK (side IN ('BUY','SELL','YES','NO')),
      size_usd        REAL NOT NULL,
      entry_price     REAL NOT NULL,
      exit_price      REAL,
      pnl             REAL,
      strategy        TEXT NOT NULL,
      source          TEXT NOT NULL DEFAULT 'legacy',
      confidence      REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      closed_at       BIGINT
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_source_ts ON paper_trades_v3(source, created_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_status ON paper_trades_v3(status, source)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS paper_trades_v3 CASCADE');
  await client.query('DROP INDEX IF EXISTS idx_signals_source');
  await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS paper_only');
  await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS source');
}
