/**
 * @module security/audit-trail-queries
 *
 * Read-only query functions for the audit trail.
 * Extracted from `audit-log.ts` to keep modules under 200 lines.
 */

import { query } from '../../db/postgres-client';
import type { IAuditEntry } from './types';
import { mapRowToEntry } from './audit-validate';
import { initHmacKey } from './audit-hmac-key';
import { computeRowHash } from './audit-hash-chain';

/**
 * Retrieve audit trail for a resource (or all resources for a tenant).
 */
export async function getAuditTrail(
  resource: string,
  limit = 100,
  tenantId?: string,
): Promise<IAuditEntry[]> {
  if (!resource || typeof resource !== 'string') {
    throw new TypeError('resource must be a non-empty string');
  }

  const clamped = Math.min(Math.max(1, Math.trunc(Number(limit)) || 100), 100);
  let sql = `
    SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id, sequence_number, hash, previous_hash
    FROM audit_log
    WHERE resource = $1
  `;
  const params: unknown[] = [resource];

  if (tenantId) {
    sql += ` AND tenant_id = $2`;
    params.push(tenantId);
  }

  sql += ` ORDER BY sequence_number DESC LIMIT $${params.length + 1}`;
  params.push(clamped);

  const { rows } = await query(sql, params);
  return rows.map((row) => mapRowToEntry(row as Record<string, unknown>));
}

/**
 * Verify the hash chain integrity for a tenant (or all tenants).
 */
export async function verifyAuditChain(tenantId?: string): Promise<{
  valid: boolean;
  brokenAt?: number;
  reason?: string;
}> {
  const key = initHmacKey();

  let sql = `
    SELECT id, tenant_id, sequence_number, hash, previous_hash, action, resource, result, metadata
    FROM audit_log
  `;
  const params: unknown[] = [];
  if (tenantId) {
    sql += ` WHERE tenant_id = $1`;
    params.push(tenantId);
  }
  sql += ` ORDER BY tenant_id, sequence_number ASC`;

  const { rows } = await query(sql, params);
  const prevHashByTenant: Record<string, string> = {};
  const prevSeqByTenant: Record<string, number> = {};

  for (const row of rows) {
    const rowTyped = row as Record<string, unknown>;
    const tid = (rowTyped.tenant_id as string) ?? '__system__';
    const seq = Number(rowTyped.sequence_number);

    const expectedSeq = (prevSeqByTenant[tid] ?? 0) + 1;
    if (seq !== expectedSeq) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Sequence gap for tenant ${tid}: expected ${expectedSeq}, got ${seq}`,
      };
    }

    const prevHash = prevHashByTenant[tid] ?? '';
    const entry: IAuditEntry = {
      id: rowTyped.id as string,
      timestamp: '',
      actor: '',
      action: rowTyped.action as string,
      resource: rowTyped.resource as string,
      result: rowTyped.result as IAuditEntry['result'],
      metadata: JSON.parse((rowTyped.metadata as string) ?? '{}'),
      ipHash: '',
    };
    const expectedHash = computeRowHash(
      key,
      tid === '__system__' ? undefined : tid,
      seq,
      prevHash,
      entry,
    );

    if (expectedHash !== rowTyped.hash) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Hash mismatch at sequence ${seq} for tenant ${tid}`,
      };
    }

    prevHashByTenant[tid] = rowTyped.hash as string;
    prevSeqByTenant[tid] = seq;
  }

  return { valid: true };
}

/**
 * Retrieve audit trail scoped to a specific tenant.
 */
export async function getAuditTrailByTenant(
  tenantId: string,
  limit = 100,
): Promise<IAuditEntry[]> {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new TypeError('tenantId must be a non-empty string');
  }

  const clamped = Math.min(Math.max(1, Math.trunc(Number(limit)) || 100), 100);
  const { rows } = await query(
    `SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id, sequence_number, hash, previous_hash
     FROM audit_log
     WHERE tenant_id = $1
     ORDER BY "timestamp" DESC
     LIMIT $2`,
    [tenantId, clamped],
  );

  return rows.map((row): IAuditEntry => {
    const rowTyped = row as Record<string, unknown>;
    return {
      id: rowTyped.id as string,
      timestamp: rowTyped.timestamp as string,
      actor: rowTyped.actor as string,
      action: rowTyped.action as string,
      resource: rowTyped.resource as string,
      result: rowTyped.result as IAuditEntry['result'],
      metadata: (rowTyped.metadata as Record<string, unknown>) ?? {},
      ipHash: rowTyped.ip_hash as string,
      tenantId: rowTyped.tenant_id as string | undefined,
    };
  });
}
