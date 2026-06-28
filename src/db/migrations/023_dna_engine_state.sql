-- Migration 023: DNA Engine State Persistence
-- Khi engine restart (deploy / crash / manual stop), nạp lại state từ DB
-- để không mất TF signals và consensus đang cache.

CREATE TABLE IF NOT EXISTS dna_engine_state (
  id            TEXT        PRIMARY KEY,          -- 'singleton' (1 row only)
  state         JSONB       NOT NULL,            -- serialized DnaEngineState
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure singleton exists (idempotent).
INSERT INTO dna_engine_state (id, state)
  VALUES ('singleton', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

-- Index không cần thiết cho 1-row table, nhưng giữ lại cho consistency.
CREATE INDEX IF NOT EXISTS idx_dna_engine_state_updated
  ON dna_engine_state (updated_at DESC);
