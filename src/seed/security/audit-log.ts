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
 * | `audit-log.ts` | Public API: `logAudit` + re-exports |
 * | `audit-validate.ts` | Input validation + row mapping |
 * | `audit-ip-hash.ts` | IP address hashing (SHA-256) |
 * | `audit-middleware.ts` | Express middleware (auto-logs responses) |
 * | `audit-hmac-key.ts` | HMAC key lifecycle (init, version tracking) |
 * | `audit-dead-letter.ts` | Dead letter queue for failed writes |
 * | `audit-hash-chain.ts` | Hash computation + DB row write |
 * | `audit-trail-queries.ts` | Read-only audit trail queries |
 * | `types.ts` | Shared interfaces |
 *
 * ## Fail-Closed Guarantee
 * `logAudit` throws on write failure (no silent drops). Callers must handle
 * or let the request fail — audit integrity > availability.
 */

import type { IAuditEntry } from './types';
import { validateEntry, METADATA_MAX_BYTES } from './audit-validate';
import { initHmacKey, getAuditHmacKeyVersion } from './audit-hmac-key';
import { createDeadLetterHandler } from './audit-dead-letter';
import { writeAuditRow } from './audit-hash-chain';
import {
  getAuditTrail,
  verifyAuditChain,
  getAuditTrailByTenant,
} from './audit-trail-queries';

// ─── Re-export config constant (backward compat) ──────────────────────────────

/** Maximum metadata size (enforced at validation + DB CHECK constraint). */
export const METADATA_MAX_BYTES_EXTERNAL = METADATA_MAX_BYTES;

// ─── Dead Letter Handler ──────────────────────────────────────────────────────

const {
  enqueueDeadLetter,
  flushDeadLetters,
  getDeadLetterStatus,
} = createDeadLetterHandler(initHmacKey, writeAuditRow);

// ─── Public API ───────────────────────────────────────────────────────────────

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

// ─── Re-export query functions (backward compat) ──────────────────────────────

export { getAuditTrail, verifyAuditChain, getAuditTrailByTenant };

// ─── Health / Operational ─────────────────────────────────────────────────────

/**
 * Current dead-letter queue status (for health checks / dashboards).
 */
export { getDeadLetterStatus };

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
export { getAuditHmacKeyVersion };

// ─── Re-exports (backward compatible) ────────────────────────────────────────

export { type IAuditEntry, type AuditResult } from './types';
export { hashIpAddress } from './audit-ip-hash';
export { auditMiddleware } from './audit-middleware';
