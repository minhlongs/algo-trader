/**
 * Migration 038: Create audit_log table
 *
 * Append-only audit trail for security and compliance logging.
 * Stores one row per audited action with SHA-256 IP hashes,
 * arbitrary JSON metadata, and indexed lookups by resource + timestamp.
 */
import { PoolClient } from 'pg';

export const id = '038-audit-log';
export const description = 'Create audit_log table for security audit trail';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT        NOT NULL PRIMARY KEY,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor       TEXT        NOT NULL,
      action      TEXT        NOT NULL,
      resource    TEXT        NOT NULL,
      result      TEXT        NOT NULL
                     CHECK (result IN ('success', 'failure', 'denied')),
      metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
      ip_hash     TEXT        NOT NULL
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_resource
      ON audit_log (resource, "timestamp" DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
      ON audit_log ("timestamp" DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor
      ON audit_log (actor, "timestamp" DESC)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS audit_log CASCADE');
}
