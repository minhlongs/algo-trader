-- Migration 011: sandbox invocation audit log
-- Tracks every per-subscriber Wasm kernel call for tamper-evidence and billing.
-- Feeds Phase 03 IronClaw capability audit.

CREATE TABLE IF NOT EXISTS sandbox_invocations (
  id             BIGSERIAL PRIMARY KEY,
  subscriber_id  TEXT        NOT NULL,
  strategy_id    TEXT        NOT NULL,
  input_hash     TEXT        NOT NULL,   -- SHA-256 hex of encoded input JSON
  output_hash    TEXT        NOT NULL,   -- SHA-256 hex of decoded output JSON
  duration_ms    NUMERIC(10,3) NOT NULL,
  signal_emitted BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-subscriber audit queries
CREATE INDEX IF NOT EXISTS idx_sandbox_invocations_subscriber
  ON sandbox_invocations (subscriber_id, created_at DESC);

-- Index for strategy-level performance analysis
CREATE INDEX IF NOT EXISTS idx_sandbox_invocations_strategy
  ON sandbox_invocations (strategy_id, created_at DESC);
