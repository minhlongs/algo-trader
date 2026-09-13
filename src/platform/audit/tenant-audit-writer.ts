/**
 * Tenant Audit Log Writer — Append entries with advisory locking
 */

import { PoolClient } from 'pg';
import { transaction } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { TenantAuditLog } from './tenant-audit-types';
import { computeTenantAuditHash } from './tenant-audit-hash';

/**
 * @deprecated Since Phase 35 security hardening (2026-08-11). Use audit_log table via src/seed/security/audit-log.ts instead.
 * This function writes to the deprecated tenant_audit_logs table. New code must not call this.
 */
export async function appendTenantAuditLog(
  tenantId: string,
  eventType: string,
  actionBy: string,
  reason: string | null,
  metadata: Record<string, unknown>,
  client?: PoolClient
): Promise<TenantAuditLog> {
  const execute = async (txClient: PoolClient): Promise<TenantAuditLog> => {
    // 1. Acquire transaction advisory lock on tenantId
    await txClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);

    // 2. Fetch latest log for tenantId to get preceding sequence_number and hash
    const latestResult = await txClient.query(
      `SELECT sequence_number, hash
       FROM tenant_audit_logs
       WHERE tenant_id = $1
       ORDER BY sequence_number DESC
       LIMIT 1`,
      [tenantId]
    );

    const nextSequence = (latestResult.rows[0]?.sequence_number as number ?? 0) + 1;
    const previousHash = latestResult.rows[0]?.hash as string | null;

    // 3. Compute hash for new entry
    const newEntryData = {
      tenant_id: tenantId,
      sequence_number: nextSequence,
      event_type: eventType,
      action_by: actionBy,
      reason,
      metadata,
      previous_hash: previousHash,
      created_at: new Date(),
    };
    const hash = computeTenantAuditHash(newEntryData);

    // 4. Insert with computed hash
    const insertResult = await txClient.query(
      `INSERT INTO tenant_audit_logs (tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at`,
      [tenantId, nextSequence, eventType, actionBy, reason, JSON.stringify(metadata), hash, previousHash]
    );

    const inserted = insertResult.rows[0];
    const logResult: TenantAuditLog = {
      id: inserted.id as string,
      tenant_id: inserted.tenant_id as string,
      sequence_number: parseInt(inserted.sequence_number as string, 10),
      event_type: inserted.event_type as string,
      action_by: inserted.action_by as string,
      reason: inserted.reason as string | null,
      metadata: inserted.metadata as Record<string, unknown>,
      hash: inserted.hash as string,
      previous_hash: inserted.previous_hash as string | null,
      created_at: new Date(inserted.created_at as string),
    };

    logger.info(`[TenantAuditLog] Appended seq ${logResult.sequence_number} for tenant ${tenantId}`);
    return logResult;
  };

  if (client) {
    return execute(client);
  } else {
    return transaction(execute);
  }
}
