-- Migration 022: Cheetahclaws-DNA Journal
-- Append-only journal for multi-timeframe consensus engine.
-- Tractability: each row is a single evaluation run (traceId + TF snapshot).
-- Legibility:   human-readable reason string + per-TF vote breakdown.
-- Explicitness: all gating logic driven from this table via `last_decision`/`confidence`.

CREATE TABLE IF NOT EXISTS dna_journal (
  id BIGSERIAL PRIMARY KEY,

  -- ── Identity ─────────────────────────────────────────────────────────────
  trace_id  TEXT        NOT NULL,          -- idempotency key (matches DnaSignal.traceId)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Outcome ──────────────────────────────────────────────────────────────
  action          TEXT        NOT NULL,   -- long | short | hold
  decision        TEXT        NOT NULL,   -- executed | paper_only | rejected_low_confidence
  confidence      DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  weighted_bull   DOUBLE PRECISION NOT NULL,
  weighted_bear   DOUBLE PRECISION NOT NULL,
  reason          TEXT        NOT NULL,   -- human-readable legibility sentence

  -- ── Regime (compact text: "normal_vol" | "elevated_vol" | "low_vol") ──────
  regime          TEXT        NOT NULL,

  -- ── TF evidence (JSON) ───────────────────────────────────────────────────
  -- [{tf, action, confidence, emaBullish, emaBearish, macdBullish,
  --   rsiBullish, obiBullish, score}] — enough to reconstruct vote.
  tf_signals      JSONB       NOT NULL,

  -- ── Mode ─────────────────────────────────────────────────────────────────
  executed_by     TEXT        NOT NULL,   -- live | paper | none
  paper_mode      BOOLEAN     NOT NULL DEFAULT true,

  -- ── Audit / trace ────────────────────────────────────────────────────────
  candle_tfs      TEXT[]      NOT NULL DEFAULT '{}',   -- [1m, 5m, 1h]
  candle_from_ms  BIGINT,                      -- inclusive
  candle_to_ms    BIGINT,                      -- inclusive
  error_message   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dna_journal_trace_id
  ON dna_journal (trace_id);

CREATE INDEX IF NOT EXISTS idx_dna_journal_created_at
  ON dna_journal (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dna_journal_regime
  ON dna_journal (regime, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dna_journal_decision
  ON dna_journal (decision, created_at DESC);

-- Fast "paper vs live" split
CREATE INDEX IF NOT EXISTS idx_dna_journal_paper_mode
  ON dna_journal (paper_mode, created_at DESC);

-- GIN on tf_signals for "find rows where any TF voted long" queries
CREATE INDEX IF NOT EXISTS idx_dna_journal_tf_signals
  ON dna_journal USING GIN (tf_signals);
