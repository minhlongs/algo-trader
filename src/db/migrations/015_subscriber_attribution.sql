-- Migration 015: Subscriber Attribution
-- Adds subscriber_id FK to trades, orders, signals for multi-tenant isolation.
-- Legacy rows get assigned to 'legacy-tenant' placeholder.

-- Add subscriber_id to trades (nullable for backfill compatibility)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS subscriber_id TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS attestation_id TEXT;

-- Backfill legacy rows with placeholder tenant
UPDATE trades SET subscriber_id = 'legacy-tenant' WHERE subscriber_id IS NULL;

-- Create index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_trades_subscriber_id ON trades(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_trades_subscriber_ts ON trades(subscriber_id, created_at);

-- Add subscriber_id to signals (if table exists)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS subscriber_id TEXT;
UPDATE signals SET subscriber_id = 'legacy-tenant' WHERE subscriber_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_signals_subscriber_id ON signals(subscriber_id);

-- Subscriber equity snapshots (daily NAV)
CREATE TABLE IF NOT EXISTS subscriber_equity_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  nav NUMERIC(20, 8) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_equity_snapshots_subscriber
  ON subscriber_equity_snapshots(subscriber_id, snapshot_date);
