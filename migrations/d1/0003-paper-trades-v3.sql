-- 0003-paper-trades-v3: D1 SQLite schema for paper trading ledger
-- Mirrors paper_trades_v3 written by persistClosedTradeToD1 and queried by handlePaperTradesLedger

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
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  closed_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_created_at ON paper_trades_v3(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_status_source ON paper_trades_v3(status, source);
CREATE INDEX IF NOT EXISTS idx_paper_trades_v3_market_id ON paper_trades_v3(market_id);
