-- D1 edge mirror schema for paper trades
-- Mirrors data/algo-trade.db :: paper_trades_v3 on M1 Max
-- Sync is one-way: M1 Max SQLite -> D1 (read-only at edge)

CREATE TABLE IF NOT EXISTS paper_trades (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  condition_id TEXT,
  slug TEXT,
  category TEXT,
  market_question TEXT NOT NULL,
  market_prob REAL NOT NULL,
  our_prob REAL NOT NULL,
  edge REAL NOT NULL,
  direction TEXT NOT NULL,
  confidence REAL,
  reasoning TEXT,
  strategy TEXT DEFAULT 'blind_event_only',
  resolved INTEGER DEFAULT 0,
  outcome TEXT,
  correct INTEGER,
  synced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_timestamp ON paper_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_paper_trades_resolved  ON paper_trades(resolved);
CREATE INDEX IF NOT EXISTS idx_paper_trades_strategy  ON paper_trades(strategy);

-- Sync state: stores last synced row id per source table
CREATE TABLE IF NOT EXISTS sync_state (
  source_table TEXT PRIMARY KEY,
  last_synced_id INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER NOT NULL DEFAULT 0
);
