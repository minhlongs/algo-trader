-- Isolated D1 feedback ledger for public beta tenant feedback submissions.
-- Forward-only, idempotent migration.

CREATE TABLE IF NOT EXISTS beta_feedback (
  feedback_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'bug',
      'confusing_workflow',
      'trading_simulation',
      'feature_suggestion',
      'other'
    )
  ),
  message TEXT NOT NULL,
  screen_id TEXT,
  app_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED', 'RESOLVED')),
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_tenant_created
  ON beta_feedback(tenant_id, created_at_ms DESC);
