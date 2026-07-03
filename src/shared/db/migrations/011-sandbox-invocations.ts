/**
 * Migration 011: Sandbox invocation audit log
 * Tracks every per-subscriber Wasm kernel call for tamper-evidence and billing
 */

import { PoolClient } from 'pg';

export const id = '011-sandbox-invocations';
export const description = 'Create sandbox invocation audit log table';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sandbox_invocations (
      id             BIGSERIAL PRIMARY KEY,
      subscriber_id  TEXT        NOT NULL,
      strategy_id    TEXT        NOT NULL,
      input_hash     TEXT        NOT NULL,
      output_hash    TEXT        NOT NULL,
      duration_ms    NUMERIC(10,3) NOT NULL,
      signal_emitted BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_sandbox_invocations_subscriber ON sandbox_invocations (subscriber_id, created_at DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_sandbox_invocations_strategy ON sandbox_invocations (strategy_id, created_at DESC)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS sandbox_invocations CASCADE');
}
