/**
 * Migration 023: DNA Engine State Persistence
 * Persists engine state across restarts (deploy / crash / manual stop)
 */

import { PoolClient } from 'pg';

export const id = '023-dna-engine-state';
export const description = 'Create DNA engine state persistence table';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dna_engine_state (
      id            TEXT        PRIMARY KEY,
      state         JSONB       NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await client.query(`
    INSERT INTO dna_engine_state (id, state)
      VALUES ('singleton', '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_dna_engine_state_updated ON dna_engine_state (updated_at DESC)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS dna_engine_state CASCADE');
}
