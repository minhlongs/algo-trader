/**
 * @module security/audit-log
 *
 * Audit-logging primitives for algo-trader.
 *
 * ## Overview
 *
 * Every significant action (API call, trade placement, key rotation, etc.)
 * produces one immutable row in the `audit_log` PostgreSQL table. IP
 * addresses are never stored in plaintext — callers pass a SHA-256 hex
 * digest via {@link IAuditEntry.ipHash}, typically produced by
 * {@link hashIpAddress}.
 *
 * ## Hash-Chain Immutability
 *
 * Rows are linked via a SHA-256 hash chain:
 * - `sequence_number`: per-tenant monotonically increasing counter
 * - `previous_hash`: hash of the previous row in the same tenant partition
 * - `hash`: SHA-256(tenant_id | sequence_number | previous_hash | payload)
 *
 * Any tampering breaks the chain. Verification via {@link verifyAuditChain}.
 *
 * ## Module Layout
 *
 * | File | Responsibility |
 * |------|----------------|
 * | `audit-log.ts` | Public API: `logAudit`, `getAuditTrail`, `verifyAuditChain` |
 * | `audit-validate.ts` | Input validation + row mapping |
 * | `audit-ip-hash.ts` | IP address hashing (SHA-256) |
 * | `audit-middleware.ts` | Express middleware (auto-logs responses) |
 * | `crypto.ts` | Encryption utilities (separate key domain) |
 *
 * ## Usage
 *
 * ```ts
 * import { logAudit, hashIpAddress } from '@/seed/security/audit-log';
 *
 * await logAudit({
 *   id: crypto.randomUUID(),
 *   timestamp: new Date().toISOString(),
 *   actor: 'user-42',
 *   action: 'api_keys.create',
 *   resource: 'ApiKey:99',
 *   result: 'success',
 *   metadata: { tier: 'PRO' },
 *   ipHash: hashIpAddress(req.headers['x-forwarded-for']),
 *   tenantId: 'tenant-abc',
 * });
 * ```
 *
 * ## Fail-Closed Guarantee
 *
 * `logAudit` throws on write failure (no silent drops). Callers must handle
 * or let the request fail — audit integrity > availability.
 */

import crypto from 'crypto';
import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';

import type { IAuditEntry, AuditResult } from './types';
import { validateEntry, mapRowToEntry, METADATA_MAX_BYTES } from './audit-validate';
import { hashIpAddress } from './audit-ip-hash';

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Maximum metadata size (enforced at validation + DB CHECK constraint). */
export const METADATA_MAX_BYTES_EXTERNAL = METADATA_MAX_BYTES;

/** HMAC key for audit chain — must be set via env AUDIT_HMAC_KEY_v1 (64 hex chars). */
let auditHmacKey: Buffer | null = null;
let auditHmacKeyVersion = 1;

/** Dead letter queue for failed audit writes (in-memory buffer). */
interface DeadLetter {
  entry: IAuditEntry;
  attempts: number;
  lastError: string;
  createdAt: number;
}
const deadLetterQueue: DeadLetter[] = [];
const MAX_DEAD_LETTER_ATTEMPTS = 3;
const DEAD_LETTER_RETRY_BASE_MS = 1000;

/** Initialize HMAC key from env — fail-fast if missing. */
function initHmacKey(): Buffer {
  if (auditHmacKey) return auditHmacKey;
  const envKey = process.env.AUDIT_HMAC_KEY_v1;
  if (!envKey) {
    const err = new Error('AUDIT_HMAC_KEY_v1 not configured — audit logging unavailable');
    logger.error('[AuditLog] Startup failure', { cause: err.message });
    throw err;
  }
  if (!/^[0-9a-f]{64}$/i.test(envKey)) {
    const err = new Error('AUDIT_HMAC_KEY_v1 must be 64 hex characters (32 bytes)');
    logger.error('[AuditLog] Invalid key format', { cause: err.message });
    throw err;
  }
  auditHmacKey = Buffer.from(envKey, 'hex');
  logger.info('[AuditLog] HMAC key initialized', { version: auditHmacKeyVersion });
  return auditHmacKey;
}

// ─── Dead Letter Queue ─────────────────────────────────────────────────────────

/** Add failed write to dead letter queue. */
function enqueueDeadLetter(entry: IAuditEntry, error: Error): void {
  deadLetterQueue.push({
    entry,
    attempts: 1,
    lastError: error.message,
    createdAt: Date.now(),
  });
  logger.warn('[AuditLog] Write failed — enqueued to dead letter queue', {
    entryId: entry.id,
    tenantId: entry.tenantId,
    error: error.message,
    queueLength: deadLetterQueue.length,
  });
}

/** Retry dead letters with exponential backoff. */
async function flushDeadLetters(): Promise<void> {
  if (deadLetterQueue.length === 0) return;

  const key = initHmacKey();
  const now = Date.now();
  const toRetry = deadLetterQueue.filter(
    (dl) => dl.attempts < MAX_DEAD_LETTER_ATTEMPTS && now - dl.createdAt > DEAD_LETTER_RETRY_BASE_MS * 2 ** (dl.attempts - 1),
  );

  for (const dl of toRetry) {
    try {
      await writeAuditRow(dl.entry, key);
      // Remove from queue on success
      const idx = deadLetterQueue.indexOf(dl);
      if (idx >= 0) deadLetterQueue.splice(idx, 1);
      logger.info('[AuditLog] Dead letter flushed', { entryId: dl.entry.id });
    } catch (err) {
      dl.attempts++;
      dl.lastError = err instanceof Error ? err.message : String(err);
      dl.createdAt = now;
      logger.warn('[AuditLog] Dead letter retry failed', {
        entryId: dl.entry.id,
        attempt: dl.attempts,
        error: dl.lastError,
      });
    }
  }

  // Alert on persistent failures
  const stuck = deadLetterQueue.filter((dl) => dl.attempts >= MAX_DEAD_LETTER_ATTEMPTS);
  if (stuck.length > 0) {
    logger.error('[AuditLog] Dead letter queue — persistent failures', {
      stuckCount: stuck.length,
      entries: stuck.map((dl) => ({ id: dl.entry.id, error: dl.lastError })),
    });
  }
}

// ─── Internal: Hash Chain Computation ──────────────────────────────────────────

/**
 * Compute the hash for a new audit row.
 *
 * Hash = HMAC-SHA256(key, tenant_id || '|' || sequence_number || '|' || previous_hash || '|' || payload)
 * where payload = id | action | resource | result | metadata_json
 */
function computeRowHash(
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

/**
 * Write a single audit row with atomic sequence number allocation.
 * Uses advisory lock per tenant to prevent sequence collisions under concurrency.
 */
async function writeAuditRow(entry: IAuditEntry, key: Buffer): Promise<void> {
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
    const hash = computeRowHash(key, tenantId ?? undefined, sequenceNumber, previousHash, entry);

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

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Write an audit entry to the immutable log.
 *
 * @param entry - Validated audit entry (use {@link hashIpAddress} for ipHash)
 * @throws {TypeError} If entry validation fails
 * @throws {Error} If write fails (fail-closed — no silent drops)
 */
export async function logAudit(entry: IAuditEntry): Promise<void> {
  // Validate before any DB interaction
  validateEntry(entry);

  // Initialize HMAC key (fail-fast)
  const key = initHmacKey();

  try {
    await writeAuditRow(entry, key);
    // Opportunistically flush dead letters after successful write
    await flushDeadLetters();
  } catch (err) {
    // Fail-closed: enqueue and re-throw so caller knows write didn't persist
    enqueueDeadLetter(entry, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * Retrieve audit trail for a resource (or all resources for a tenant).
 *
 * @param resource - Resource identifier (e.g., 'ApiKey:42') or tenant-scoped query
 * @param limit - Max rows (default 100, max 100)
 * @param tenantId - Optional tenant filter (when resource is generic)
 * @returns Array of audit entries, newest first
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

  sql += ` ORDER BY "timestamp" DESC LIMIT $${params.length + 1}`;
  params.push(clamped);

  const { rows } = await query(sql, params);
  return rows.map(mapRowToEntry);
}

/**
 * Verify the hash chain integrity for a tenant (or all tenants).
 *
 * @param tenantId - Tenant to verify, or undefined for all
 * @returns { valid: true } or { valid: false, brokenAt, reason }
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

  let prevHashByTenant: Record<string, string> = {};
  let prevSeqByTenant: Record<string, number> = {};

  for (const row of rows) {
    const rowTyped = row as Record<string, unknown>;
    const tid = (rowTyped.tenant_id as string) ?? '__system__';
    const seq = Number(rowTyped.sequence_number);

    // Check sequence continuity
    const expectedSeq = (prevSeqByTenant[tid] ?? 0) + 1;
    if (seq !== expectedSeq) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Sequence gap at ${tid}:${seq} (expected ${expectedSeq})`,
      };
    }
    prevSeqByTenant[tid] = seq;

    // Recompute hash
    const entry: IAuditEntry = {
      id: rowTyped.id as string,
      timestamp: rowTyped.timestamp as string,
      actor: rowTyped.actor as string,
      action: rowTyped.action as string,
      resource: rowTyped.resource as string,
      result: rowTyped.result as AuditResult,
      metadata: (rowTyped.metadata as Record<string, unknown>) ?? {},
      ipHash: rowTyped.ip_hash as string,
      tenantId: rowTyped.tenant_id as string | undefined,
    };
    const expectedHash = computeRowHash(key, rowTyped.tenant_id as string | undefined, seq, prevHashByTenant[tid] ?? '', entry);

    if (rowTyped.hash !== expectedHash) {
      return {
        valid: false,
        brokenAt: seq,
        reason: `Hash mismatch at ${tid}:${seq}: expected ${expectedHash}, got ${rowTyped.hash}`,
      };
    }
    prevHashByTenant[tid] = rowTyped.hash as string;
  }

  return { valid: true };
}

/**
 * Retrieve all audit entries for a tenant (newest first).
 *
 * @param tenantId - Tenant to filter by
 * @param limit - Max rows (default 100, max 100)
 * @returns Array of audit entries, newest first
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
      result: rowTyped.result as AuditResult,
      metadata: (rowTyped.metadata as Record<string, unknown>) ?? {},
      ipHash: rowTyped.ip_hash as string,
      tenantId: rowTyped.tenant_id as string | undefined,
    };
  });
}

/**
 * Get dead letter queue status (for monitoring/alerting).
 */
export function getDeadLetterStatus(): { queued: number; stuck: number; oldest?: number } {
  const now = Date.now();
  const stuck = deadLetterQueue.filter((dl) => dl.attempts >= MAX_DEAD_LETTER_ATTEMPTS).length;
  const oldest = deadLetterQueue.length > 0 ? Math.min(...deadLetterQueue.map((dl) => dl.createdAt)) : undefined;
  return { queued: deadLetterQueue.length, stuck, oldest: oldest ? now - oldest : undefined };
}

/**
 * Manually trigger dead letter flush (for admin/ops).
 */
export async function flushDeadLettersNow(): Promise<void> {
  await flushDeadLetters();
}

/**
 * Get current HMAC key version (for readiness/health checks).
 * Does not expose the key itself.
 */
export function getAuditHmacKeyVersion(): number {
  initHmacKey(); // validates presence
  return auditHmacKeyVersion;
}

// ─── Re-exports ────────────────────────────────────────────────────────────────

export { type IAuditEntry, type AuditResult } from './types';
export { hashIpAddress } from './audit-ip-hash';
export { auditMiddleware } from './audit-middleware';