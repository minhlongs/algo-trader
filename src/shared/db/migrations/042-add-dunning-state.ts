/**
 * Migration 042: Add dunning_state table
 * Persists dunning (payment failure) records in PostgreSQL for restart resilience.
 *
 * This replaces the in-memory Map in DunningService with a proper DB-backed store,
 * ensuring dunning records survive service restarts.
 */
import { PoolClient } from 'pg';

export const id = '042-add-dunning-state';
export const description = 'Create dunning_state table for persistent dunning records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dunning_state (
      license_id VARCHAR(128) PRIMARY KEY,
      subscription_id VARCHAR(128),
      customer_email TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      first_failure_date TIMESTAMPTZ NOT NULL,
      last_failure_date TIMESTAMPTZ NOT NULL,
      suspension_date TIMESTAMPTZ,
      reinstatement_date TIMESTAMPTZ,
      status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'warning', 'suspended', 'reinstated')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dunning_state_status
    ON dunning_state(status)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dunning_state_customer_email
    ON dunning_state(customer_email)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_dunning_state_customer_email');
  await client.query('DROP INDEX IF EXISTS idx_dunning_state_status');
  await client.query('DROP TABLE IF EXISTS dunning_state CASCADE');
}
