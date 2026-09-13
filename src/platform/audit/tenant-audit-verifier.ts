/**
 * Tenant Audit Log Verifier — Verify hash chain integrity
 */

import { query } from '../../shared/db/postgres-client';
import type { TenantChainVerificationResult } from './tenant-audit-types';
import { computeTenantAuditHash } from './tenant-audit-hash';

export async function verifyTenantChain(
  tenantId: string
): Promise<TenantChainVerificationResult> {
  // Query all logs ordered by sequence_number
  const result = await query(
    `SELECT id, tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at
     FROM tenant_audit_logs
     WHERE tenant_id = $1
     ORDER BY sequence_number ASC`,
    [tenantId]
  );

  const rows = result.rows;
  if (rows.length === 0) {
    return { valid: true };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const seq = parseInt(row.sequence_number as string, 10);

    if (seq !== i + 1) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Sequence gap: expected ${i + 1}, got ${seq}`,
      };
    }

    // For the first log, previous_hash must be null
    if (i === 0 && row.previous_hash !== null) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `previous_hash mismatch at sequence ${seq}: expected null, got ${row.previous_hash}`,
      };
    }

    // For subsequent logs, previous_hash must match the hash of the previous log
    if (i > 0) {
      const prevRow = rows[i - 1];
      if (row.previous_hash !== prevRow.hash) {
        return {
          valid: false,
          brokenAt: seq,
          reason: `previous_hash mismatch at sequence ${seq}: expected ${prevRow.hash}, got ${row.previous_hash}`,
        };
      }
    }

    const expectedHash = computeTenantAuditHash({
      tenant_id: row.tenant_id as string,
      sequence_number: seq,
      event_type: row.event_type as string,
      action_by: row.action_by as string,
      reason: row.reason as string | null,
      metadata: row.metadata as unknown as Record<string, unknown>,
      previous_hash: row.previous_hash as string | null,
      created_at: row.created_at as Date | string,
    });

    if (row.hash !== expectedHash) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Hash mismatch at sequence ${seq}: expected ${expectedHash}, got ${row.hash}`,
      };
    }
  }

  return { valid: true };
}
