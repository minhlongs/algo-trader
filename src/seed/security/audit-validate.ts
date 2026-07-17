/**
 * Validation helpers for audit-log entries.
 *
 * @module security/audit-validate
 */

import type { IAuditEntry, AuditResult } from './types';

/** Upper bound on `metadata` JSON byte size — prevents DoS via huge payloads. */
export const METADATA_MAX_BYTES = 4_096;

/** Allowed values for `IAuditEntry.result`. */
export const VALID_RESULTS: readonly AuditResult[] = ['success', 'failure', 'denied'];

/** Throw `TypeError` if any field on `entry` is missing or has the wrong type. */
export function validateEntry(entry: IAuditEntry): void {
 if (typeof entry.id !== 'string' || entry.id.trim() === '') {
 throw new TypeError('IAuditEntry.id must be a non-empty string');
 }
 if (typeof entry.timestamp !== 'string' || Number.isNaN(Date.parse(entry.timestamp))) {
 throw new TypeError('IAuditEntry.timestamp must be an ISO-8601 string');
 }
 if (typeof entry.actor !== 'string' || entry.actor.trim() === '') {
 throw new TypeError('IAuditEntry.actor must be a non-empty string');
 }
 if (typeof entry.action !== 'string' || entry.action.trim() === '') {
 throw new TypeError('IAuditEntry.action must be a non-empty string');
 }
 if (typeof entry.resource !== 'string' || entry.resource.trim() === '') {
 throw new TypeError('IAuditEntry.resource must be a non-empty string');
 }
 if (!VALID_RESULTS.includes(entry.result)) {
 throw new TypeError(
 `IAuditEntry.result must be one of 'success'|'failure'|'denied' (got "${entry.result}")`,
 );
 }
 if (
 typeof entry.metadata !== 'object'
 || entry.metadata === null
 || Array.isArray(entry.metadata)
 ) {
 throw new TypeError('IAuditEntry.metadata must be a plain object');
 }
 const metaBytes = Buffer.byteLength(JSON.stringify(entry.metadata), 'utf8');
 if (metaBytes > METADATA_MAX_BYTES) {
 throw new TypeError(
 `IAuditEntry.metadata exceeds ${METADATA_MAX_BYTES} bytes (got ${metaBytes})`,
 );
 }
 if (typeof entry.ipHash !== 'string' || entry.ipHash.trim() === '') {
 throw new TypeError('IAuditEntry.ipHash must be a non-empty hex string');
 }
}

/** Map a raw pg row (snake_case columns) to {@link IAuditEntry}. */
export function mapRowToEntry(row: Record<string, unknown>): IAuditEntry {
 return {
 id: row.id as string,
 timestamp: row.timestamp as string,
 actor: row.actor as string,
 action: row.action as string,
 resource: row.resource as string,
 result: row.result as AuditResult,
 metadata: ((row.metadata ?? {}) as Record<string, unknown>),
 ipHash: row.ip_hash as string,
 tenantId: row.tenant_id as string | undefined,
 };
}
