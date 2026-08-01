import { createHash } from 'crypto';
import { transaction, query } from '../../shared/db/postgres-client';
import { PoolClient } from 'pg';
import { logger } from '../../shared/utils/logger';

export interface TenantAuditLog {
  id: string;
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  hash: string;
  previous_hash: string | null;
  created_at: Date;
}

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const typedObj = obj as Record<string, unknown>;
  const keys = Object.keys(typedObj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(typedObj[k])}`);
  return '{' + parts.join(',') + '}';
}

export function computeTenantAuditHash(entry: {
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  created_at: Date | string;
}): string {
  const timeStr = entry.created_at instanceof Date 
    ? entry.created_at.toISOString() 
    : new Date(entry.created_at).toISOString();

  const payloadObj = {
    tenant_id: entry.tenant_id,
    sequence_number: String(entry.sequence_number),
    event_type: entry.event_type,
    action_by: entry.action_by,
    reason: entry.reason,
    metadata: entry.metadata,
    previous_hash: entry.previous_hash,
    created_at: timeStr,
  };

  const payload = canonicalJsonStringify(payloadObj);
  return createHash('sha256').update(payload).digest('hex');
}

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

    let nextSequence = 1;
    let previousHash: string | null = null;

    if (latestResult.rows.length > 0) {
      const lastRow = latestResult.rows[0];
      nextSequence = parseInt(lastRow.sequence_number as string, 10) + 1;
      previousHash = lastRow.hash as string;
    }

    const createdAt = new Date();

    // 3. Compute hash
    const hash = computeTenantAuditHash({
      tenant_id: tenantId,
      sequence_number: nextSequence,
      event_type: eventType,
      action_by: actionBy,
      reason,
      metadata,
      previous_hash: previousHash,
      created_at: createdAt,
    });

    // 4. Insert log
    const insertResult = await txClient.query(
      `INSERT INTO tenant_audit_logs (
         tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at`,
      [
        tenantId,
        nextSequence,
        eventType,
        actionBy,
        reason,
        JSON.stringify(metadata),
        hash,
        previousHash,
        createdAt
      ]
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

export async function verifyTenantChain(
  tenantId: string
): Promise<{ valid: boolean; brokenAt?: number; reason?: string }> {
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
        reason: `Sequence gap or mismatch: expected ${i + 1}, got ${seq}`,
      };
    }

    if (i === 0) {
      if (row.previous_hash !== null && row.previous_hash !== undefined && row.previous_hash !== '') {
        return {
          valid: false,
          brokenAt: seq,
          reason: `Genesis entry previous_hash is not null: got ${row.previous_hash}`,
        };
      }
    } else {
      const prevRow = rows[i - 1];
      if (row.previous_hash !== prevRow.hash) {
        return {
          valid: false,
          brokenAt: seq,
          reason: `previous_hash mismatch at sequence ${seq}: expected ${prevRow.hash}, got ${row.previous_hash}`,
        };
      }
    }

    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

    const recomputedHash = computeTenantAuditHash({
      tenant_id: row.tenant_id as string,
      sequence_number: seq,
      event_type: row.event_type as string,
      action_by: row.action_by as string,
      reason: row.reason as string | null,
      metadata: metadata as Record<string, unknown>,
      previous_hash: row.previous_hash as string | null,
      created_at: row.created_at as Date | string,
    });

    if (row.hash !== recomputedHash) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Hash mismatch at sequence ${seq}: expected ${recomputedHash}, got ${row.hash}`,
      };
    }
  }

  return { valid: true };
}
