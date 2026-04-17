-- Migration 017: Strategy review tasks queue
-- Soft upstream signal for human-review when Qwen quality drifts.
-- Purely observational — no side-effects on trading flow.

CREATE TABLE IF NOT EXISTS strategy_review_tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT        NOT NULL,
  trigger_reason TEXT        NOT NULL,
  metrics        JSONB       NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_strategy_review_tasks_source_status
  ON strategy_review_tasks (source, status, created_at DESC);

-- One alert per source+reason per UTC calendar day.
-- Uses ((created_at AT TIME ZONE 'UTC')::date) because date_trunc is STABLE, not
-- IMMUTABLE — PG refuses STABLE expressions in UNIQUE indexes on some versions.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_strategy_review_tasks_daily
  ON strategy_review_tasks (source, trigger_reason, ((created_at AT TIME ZONE 'UTC')::date));
