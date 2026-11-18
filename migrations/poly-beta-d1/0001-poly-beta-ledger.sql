-- 0001-poly-beta-ledger.sql
-- Isolated D1 schema for Release A (`poly-beta-db`).
-- Every tenant-owned row carries a mandatory `tenant_id` foreign-partition key
-- checked server-side on 100% of queries. Zero real-money or key columns exist.

CREATE TABLE IF NOT EXISTS beta_users (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  password_salt   TEXT NOT NULL,
  disclosure_ack  INTEGER NOT NULL DEFAULT 1 CHECK (disclosure_ack = 1),
  created_at_ms   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS beta_sessions (
  session_hash    TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  csrf_token      TEXT NOT NULL,
  expires_at_ms   INTEGER NOT NULL,
  created_at_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beta_sessions_tenant ON beta_sessions(tenant_id);

CREATE TABLE IF NOT EXISTS beta_portfolios (
  tenant_id               TEXT PRIMARY KEY,
  mode                    TEXT NOT NULL DEFAULT 'PAPER' CHECK (mode = 'PAPER'),
  initial_capital_micro   INTEGER NOT NULL DEFAULT 100000000,
  cash_balance_micro      INTEGER NOT NULL DEFAULT 100000000,
  realized_pnl_micro      INTEGER NOT NULL DEFAULT 0,
  settled_pnl_micro       INTEGER NOT NULL DEFAULT 0,
  fees_paid_micro         INTEGER NOT NULL DEFAULT 0,
  peak_equity_micro       INTEGER NOT NULL DEFAULT 100000000,
  max_drawdown_bps        INTEGER NOT NULL DEFAULT 0,
  selected_strategy_id    TEXT NOT NULL DEFAULT 'toxicity-aware-mm-paper',
  selected_market_id      TEXT,
  engine_state            TEXT NOT NULL DEFAULT 'STOPPED' CHECK (engine_state IN ('STOPPED','RUNNING','PAUSED','HALTED')),
  halt_reason             TEXT,
  last_tick_at_ms         INTEGER,
  updated_at_ms           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS beta_positions (
  tenant_id           TEXT NOT NULL,
  market_id           TEXT NOT NULL,
  token_id            TEXT NOT NULL,
  market_question     TEXT NOT NULL,
  outcome             TEXT NOT NULL CHECK (outcome IN ('YES','NO')),
  shares_micro        INTEGER NOT NULL DEFAULT 0,
  avg_entry_micro     INTEGER NOT NULL DEFAULT 0,
  mark_price_micro    INTEGER NOT NULL DEFAULT 0,
  unrealized_micro    INTEGER NOT NULL DEFAULT 0,
  updated_at_ms       INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, token_id)
);

CREATE TABLE IF NOT EXISTS beta_orders (
  order_id            TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL,
  strategy_id         TEXT NOT NULL,
  market_id           TEXT NOT NULL,
  token_id            TEXT NOT NULL,
  market_question     TEXT NOT NULL,
  outcome             TEXT NOT NULL CHECK (outcome IN ('YES','NO')),
  side                TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  price_micro         INTEGER NOT NULL,
  size_shares_micro   INTEGER NOT NULL,
  filled_shares_micro INTEGER NOT NULL DEFAULT 0,
  fee_micro           INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL CHECK (status IN ('PENDING','FILLED','CANCELLED','REJECTED')),
  reject_reason       TEXT,
  model_assumption    TEXT NOT NULL,
  source_timestamp_ms INTEGER NOT NULL,
  created_at_ms       INTEGER NOT NULL,
  updated_at_ms       INTEGER NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_beta_orders_tenant_created ON beta_orders(tenant_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS beta_fills (
  fill_id             TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  strategy_id         TEXT NOT NULL,
  market_id           TEXT NOT NULL,
  token_id            TEXT NOT NULL,
  market_question     TEXT NOT NULL,
  outcome             TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('BUY','SELL','SETTLE')),
  price_micro         INTEGER NOT NULL,
  shares_micro        INTEGER NOT NULL,
  notional_micro      INTEGER NOT NULL,
  fee_micro           INTEGER NOT NULL,
  realized_delta_micro INTEGER NOT NULL DEFAULT 0,
  settled_delta_micro INTEGER NOT NULL DEFAULT 0,
  source_timestamp_ms INTEGER NOT NULL,
  created_at_ms       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beta_fills_tenant_created ON beta_fills(tenant_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS beta_ledger_entries (
  entry_id            TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  seq                 INTEGER NOT NULL,
  entry_type          TEXT NOT NULL CHECK (entry_type IN ('GENESIS_GRANT','ORDER_FILL','FEE_DEBIT','SETTLEMENT_PAYOUT')),
  reference_id        TEXT NOT NULL,
  cash_delta_micro    INTEGER NOT NULL,
  cash_after_micro    INTEGER NOT NULL,
  realized_delta_micro INTEGER NOT NULL DEFAULT 0,
  settled_delta_micro INTEGER NOT NULL DEFAULT 0,
  fee_micro           INTEGER NOT NULL DEFAULT 0,
  note                TEXT NOT NULL,
  created_at_ms       INTEGER NOT NULL,
  UNIQUE (tenant_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_beta_ledger_tenant_seq ON beta_ledger_entries(tenant_id, seq DESC);

CREATE TABLE IF NOT EXISTS beta_execution_logs (
  log_id              TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  level               TEXT NOT NULL CHECK (level IN ('INFO','WARN','RISK_BLOCK','HALT')),
  event_code          TEXT NOT NULL,
  detail              TEXT NOT NULL,
  created_at_ms       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beta_logs_tenant_created ON beta_execution_logs(tenant_id, created_at_ms DESC);
