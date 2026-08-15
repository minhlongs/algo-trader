/**
 * @module security/audit-hash-chain
 *
 * SHA-256 HMAC hash-chain computation and DB write for audit rows.
 *
 * Each audit row is linked to the previous via:
 * - `sequence_number`: per-tenant monotonically increasing counter
 * - `previous_hash`: hash of the previous row in the same tenant partition
 * - `hash`: HMAC-SHA256(tenant_id | sequence_number | previous_hash | payload)
 *
 * Uses advisory locks per tenant to prevent sequence collisions under concurrency.
 */

import crypto from 'crypto';
import { query } from '../../db/postgres-client';
import type { IAuditEntry } from './types';

// ─── Hash Chain Computation ────────────────────────────────────────────────────

/**
 * Compute the hash for a new audit row.
 *
 * Hash = HMAC-SHA256(key, tenant_id || '|' || sequence_number || '|' || previous_hash || '|' || payload)
 * where payload = id | action | resource | result | metadata_json
 */
export function computeRowHash(
  key: Buffer,
  tenantId: string | undefined,
  sequenceNumber: number,
  previousHash: string,
  entry: IAuditEntry,
): string {
  const tid = tenantId ?? '__system__';
  const metaJson = JSON.stringify(entry.metadata);
  const payload = `${entry.id}|${entry.action}|${entry.resource}|${entry.result}|${metaJson}`;
  const data = `${tid}|${sequenceNumber}|${previousHash}|${payload}`;
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

// ─── Row Write ────────────────────────────────────────────────────────────────

/**
 * Write a single audit row with atomic sequence number allocation.
 * Uses advisory lock per tenant to prevent sequence collisions under concurrency.
 */
export async function writeAuditRow(
  entry: IAuditEntry,
  key: Buffer,
): Promise<void> {
  const tenantId = entry.tenantId;

  // Acquire advisory lock for this tenant (hash tenant_id to 64-bit int)
  const lockKey = tenantId
    ? crypto.createHash('sha256').update(tenantId).digest().readBigInt64BE()
    : 0n; // system events use lock 0

  await query('SELECT pg_advisory_xact_lock($1)', [lockKey.toString()]);

  try {
    // Get the next sequence number for this tenant
    const seqResult = await query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
       FROM audit_log
       WHERE tenant_id IS NOT DISTINCT FROM $1`,
      [tenantId ?? null],
    );
    const sequenceNumber = Number(seqResult.rows[0]?.next_seq ?? 1);

    // Get previous hash
    const prevResult = await query(
      `SELECT hash FROM audit_log
       WHERE tenant_id IS NOT DISTINCT FROM $1
       ORDER BY sequence_number DESC
       LIMIT 1`,
      [tenantId ?? null],
    );
    const previousHash = String(prevResult.rows[0]?.hash ?? '');

    // Compute hash
    const hash = computeRowHash(
      key,
      tenantId ?? undefined,
      sequenceNumber,
      previousHash,
      entry,
    );

    // Insert
    await query(
      `INSERT INTO audit_log (id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id, sequence_number, hash, previous_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.id,
        entry.timestamp,
        entry.actor,
        entry.action,
        entry.resource,
        entry.result,
        JSON.stringify(entry.metadata),
        entry.ipHash,
        tenantId ?? null,
        sequenceNumber,
        hash,
        previousHash,
      ],
    );
  } finally {
    // Release advisory lock
    await query('SELECT pg_advisory_xact_unlock($1)', [lockKey.toString()]);
  }
}
