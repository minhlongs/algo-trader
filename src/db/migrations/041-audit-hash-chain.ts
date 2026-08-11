/**
 * Migration 041: Add hash-chain columns to audit_log for immutable audit trail
 *
 * - sequence_number: per-tenant monotonically increasing sequence
 * - hash: SHA-256 hash chain (tenant_id || sequence_number || previous_hash || payload)
 * - previous_hash: links to previous row for tamper detection
 *
 * Also backfills existing rows with deterministic sequence ordering.
 */

import { PoolClient } from 'pg';

export const id = '041-audit-hash-chain';
export const description = 'Add hash-chain columns to audit_log for immutable audit trail';

export async function up(client: PoolClient): Promise<void> {
  // Ensure pgcrypto extension for digest() function
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // Add hash-chain columns
  await client.query(`
    ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS sequence_number BIGINT,
    ADD COLUMN IF NOT EXISTS hash TEXT,
    ADD COLUMN IF NOT EXISTS previous_hash TEXT
  `);

  // Create unique index on (tenant_id, sequence_number) for gap detection
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_tenant_sequence
    ON audit_log (tenant_id, sequence_number)
    WHERE tenant_id IS NOT NULL
  `);

  // Backfill sequence_number and hash chain for existing rows
  // Order deterministically by (tenant_id, timestamp, id)
  await client.query(`
    WITH ordered AS (
      SELECT
        id,
        tenant_id,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(tenant_id, '__system__')
          ORDER BY "timestamp" ASC, id ASC
        ) AS seq,
        LAG(id) OVER (
          PARTITION BY COALESCE(tenant_id, '__system__')
          ORDER BY "timestamp" ASC, id ASC
        ) AS prev_id
      FROM audit_log
      WHERE sequence_number IS NULL
    ),
    with_prev_hash AS (
      SELECT
        o.id,
        o.seq AS sequence_number,
        o.tenant_id,
        COALESCE(prev.hash, '') AS previous_hash
      FROM ordered o
      LEFT JOIN audit_log prev ON prev.id = o.prev_id
    ),
    payload AS (
      SELECT
        id,
        tenant_id,
        sequence_number,
        previous_hash,
        -- Compute hash: SHA-256(tenant_id || '|' || sequence_number || '|' || previous_hash || '|' || id || '|' || action || '|' || resource || '|' || result || '|' || metadata)
        encode(digest(
          COALESCE(tenant_id, '__system__') || '|' ||
          sequence_number::text || '|' ||
          previous_hash || '|' ||
          id || '|' ||
          action || '|' ||
          resource || '|' ||
          result || '|' ||
          metadata::text,
          'sha256'
        ), 'hex') AS hash
      FROM with_prev_hash
      JOIN audit_log al ON al.id = with_prev_hash.id
    )
    UPDATE audit_log al
    SET
      sequence_number = p.sequence_number,
      previous_hash = p.previous_hash,
      hash = p.hash
    FROM payload p
    WHERE al.id = p.id;
  `);

  // Add NOT NULL constraints after backfill
  await client.query(`
    ALTER TABLE audit_log
    ALTER COLUMN sequence_number SET NOT NULL,
    ALTER COLUMN hash SET NOT NULL,
    ALTER COLUMN previous_hash SET NOT NULL
  `);

  // Also ensure tenant_id can be NULL (system events) but sequence exists
  // Add index for hash verification queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_hash
    ON audit_log (hash)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_audit_log_hash');
  await client.query('DROP INDEX IF EXISTS idx_audit_log_tenant_sequence');
  await client.query('ALTER TABLE audit_log DROP COLUMN IF EXISTS sequence_number');
  await client.query('ALTER TABLE audit_log DROP COLUMN IF EXISTS hash');
  await client.query('ALTER TABLE audit_log DROP COLUMN IF EXISTS previous_hash');
}