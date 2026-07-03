/**
 * Migration 022: DNA Journal
 * Append-only journal for multi-timeframe consensus engine
 */

import { PoolClient } from 'pg';

export const id = '022-dna-journal';
export const description = 'Create DNA journal table for multi-timeframe consensus';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dna_journal (
      id BIGSERIAL PRIMARY KEY,
      trace_id  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      action          TEXT NOT NULL,
      decision        TEXT NOT NULL,
      confidence      DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      weighted_bull   DOUBLE PRECISION NOT NULL,
      weighted_bear   DOUBLE PRECISION NOT NULL,
      reason          TEXT NOT NULL,

      regime          TEXT NOT NULL,

      tf_signals      JSONB NOT NULL,

      executed_by     TEXT NOT NULL,
      paper_mode      BOOLEAN NOT NULL DEFAULT true,

      candle_tfs      TEXT[] NOT NULL DEFAULT '{}',
      candle_from_ms  BIGINT,
      candle_to_ms    BIGINT,
      error_message   TEXT
    )
  `);

  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_dna_journal_trace_id ON dna_journal (trace_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_journal_created_at ON dna_journal (created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_journal_regime ON dna_journal (regime, created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_journal_decision ON dna_journal (decision, created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_journal_paper_mode ON dna_journal (paper_mode, created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_journal_tf_signals ON dna_journal USING GIN (tf_signals)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS dna_journal CASCADE');
}
