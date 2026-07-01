-- Migration 018: Qwen signals loop run journal
-- Persists every evaluation run for audit, trend analysis, and threshold tuning.
-- Purely observational — no side-effects on trading flow.

CREATE TABLE IF NOT EXISTS qwen_signals_loop_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT        NOT NULL DEFAULT 'qwen-m1max',
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics         JSONB       NOT NULL,
  decision        TEXT        NOT NULL CHECK (decision IN (
                    'skipped_insufficient_data', 'ok', 'queued_review', 'error'
                  )),
  trigger_reasons TEXT[]      NOT NULL DEFAULT '{}',
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_qwen_signals_loop_runs_ran_at
  ON qwen_signals_loop_runs (ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_qwen_signals_loop_runs_decision
  ON qwen_signals_loop_runs (decision, ran_at DESC);
