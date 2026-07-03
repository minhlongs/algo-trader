/**
 * Migration 015: Subscriber Attribution
 * Adds subscriber_id FK to trades, orders, signals for multi-tenant isolation
 */

import { PoolClient } from 'pg';

export const id = '015-subscriber-attribution';
export const description = 'Add subscriber_id to trades and signals for multi-tenant isolation';

export async function up(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE trades ADD COLUMN IF NOT EXISTS subscriber_id TEXT');
  await client.query('ALTER TABLE trades ADD COLUMN IF NOT EXISTS attestation_id TEXT');
  await client.query("UPDATE trades SET subscriber_id = 'legacy-tenant' WHERE subscriber_id IS NULL");
  await client.query('CREATE INDEX IF NOT EXISTS idx_trades_subscriber_id ON trades(subscriber_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_trades_subscriber_ts ON trades(subscriber_id, created_at)');

  await client.query('ALTER TABLE signals ADD COLUMN IF NOT EXISTS subscriber_id TEXT');
  await client.query("UPDATE signals SET subscriber_id = 'legacy-tenant' WHERE subscriber_id IS NULL");
  await client.query('CREATE INDEX IF NOT EXISTS idx_signals_subscriber_id ON signals(subscriber_id)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriber_equity_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      subscriber_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      nav NUMERIC(20, 8) NOT NULL DEFAULT 0,
      realized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_equity_snapshots_subscriber ON subscriber_equity_snapshots(subscriber_id, snapshot_date)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS subscriber_equity_snapshots CASCADE');
  await client.query('DROP INDEX IF EXISTS idx_signals_subscriber_id');
  await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS subscriber_id');
  await client.query('DROP INDEX IF EXISTS idx_trades_subscriber_ts');
  await client.query('DROP INDEX IF EXISTS idx_trades_subscriber_id');
  await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS attestation_id');
  await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS subscriber_id');
}
