-- Migration 016: Qwen paper-trading tracking
-- Phase 04 — paper-gate + rollback harness
-- Adds source column to signals + creates paper_trades_v3 table for Qwen tracking.

-- Add source column to signals (tracks which system produced the signal)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE signals ADD COLUMN IF NOT EXISTS paper_only INTEGER NOT NULL DEFAULT 0; -- 1=paper only, 0=eligible for live
CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source, ts DESC);

-- paper_trades_v3: source-tagged paper trade ledger for A/B P&L comparison
CREATE TABLE IF NOT EXISTS paper_trades_v3 (
  id              TEXT PRIMARY KEY,
  market_id       TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('BUY','SELL','YES','NO')),
  size_usd        REAL NOT NULL,
  entry_price     REAL NOT NULL,
  exit_price      REAL,
  pnl             REAL,
  strategy        TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'legacy', -- 'qwen' | 'deepseek' | 'swarm' | 'legacy' | 'manual'
  confidence      REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  closed_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_source_ts ON paper_trades_v3(source, created_at);
CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_status ON paper_trades_v3(status, source);
