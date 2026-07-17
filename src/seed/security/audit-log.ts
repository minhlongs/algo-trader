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
 * ## Module Layout
 *
 * | File | Responsibility |
 * |------|---------------|
 * | `audit-log.ts` (this) | Public API — `logAudit`, `getAuditTrail`, re-exports |
 * | `audit-ip-hash.ts` | `hashIpAddress` — IP hashing |
 * | `audit-validate.ts` | `validateEntry`, `mapRowToEntry`, constants |
 * | `audit-middleware.ts` | `auditMiddleware` — Express integration |
 * | `types.ts` | `IAuditEntry`, `AuditResult` interfaces |
 *
 * ## Database
 *
 * Uses the shared pg pool from `src/db/postgres-client.ts`. No ORM — raw
 * parameterised SQL prevents injection. Requires migration 038
 * (`src/db/migrations/038-audit-log.ts`).
 *
 * ## Thread-safety
 *
 * `logAudit` and `getAuditTrail` are safe to call from any async context:
 * the pool serialises within its `maxConnections` cap (default 10).
 */

import { query } from '../../db/postgres-client';

import { METADATA_MAX_BYTES, validateEntry, mapRowToEntry } from './audit-validate';
import { hashIpAddress } from './audit-ip-hash';

import type { IAuditEntry, AuditResult } from './types';

/** Default cap on rows returned by `getAuditTrail` when caller omits `limit`. */
const DEFAULT_TRAIL_LIMIT = 100;
/** Hard ceiling on any single `getAuditTrail` call. */
const TRAIL_LIMIT_CEIL = 100;

/* ------------------------------------------------------------------ */
/* SQL fragments                                                        */
/* ------------------------------------------------------------------ */

const INSERT_SQL = /* sql */ `
INSERT INTO audit_log (
 id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

const SELECT_BY_TENANT_SQL = /* sql */ `
SELECT
 id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
FROM audit_log
WHERE tenant_id = $1
ORDER BY "timestamp" DESC
LIMIT $2
`;

const SELECT_SQL = /* sql */ `
SELECT
 id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
FROM audit_log
WHERE resource = $1
ORDER BY "timestamp" DESC
LIMIT $2
`;

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/**
 * Insert a single audit record into PostgreSQL.
 *
 * Validates every field before hitting the database so callers get an
 * immediate `TypeError` rather than a silent bad row.
 *
 * @param entry - fully-formed {@link IAuditEntry}. Generate `id` with
 * `crypto.randomUUID()` unless you have a specific reason.
 * @returns `Promise<void>` — resolves after the INSERT commits.
 *
 * @throws {TypeError} First validation failure encountered.
 *
 * @example
 * await logAudit({
 * id: crypto.randomUUID(),
 * timestamp: new Date().toISOString(),
 * actor: 'user-abc',
 * action: 'strategy.start',
 * resource: 'Strategy:42',
 * result: 'success',
 * metadata: { mode: 'paper', qty: 100 },
 * ipHash: hashIpAddress(req.ip),
 * });
 */
export async function logAudit(entry: IAuditEntry): Promise<void> {
 validateEntry(entry);

 const params = [
 entry.id,
 entry.timestamp,
 entry.actor,
 entry.action,
 entry.resource,
 entry.result,
 entry.metadata,
 entry.ipHash,
 entry.tenantId ?? null,
 ];

 await query(INSERT_SQL, params);
}

/**
 * Return the most recent audit rows for a tenant, newest first.
 *
 * Useful for compliance dashboards, incident forensics, or per-tenant
 * activity feeds.
 *
 * @param tenantId - tenant identifier
 * @param limit - max rows (clamped to 1–100, default 100)
 * @returns `Promise<IAuditEntry[]>` — may be empty
 *
 * @throws {TypeError} If `tenantId` is not a non-empty string.
 *
 * @example
 * const events = await getAuditTrailByTenant('tenant-1', 20);
 * events.forEach(e => logger.info(e.action, { result: e.result }));
 */
export async function getAuditTrailByTenant(
 tenantId: string,
 limit = DEFAULT_TRAIL_LIMIT,
): Promise<IAuditEntry[]> {
 if (typeof tenantId !== 'string' || tenantId.trim() === '') {
 throw new TypeError('tenantId must be a non-empty string');
 }

 const clamped = Math.min(
 Math.max(1, Math.trunc(Number(limit)) || DEFAULT_TRAIL_LIMIT),
 TRAIL_LIMIT_CEIL,
 );

 const { rows } = await query(SELECT_BY_TENANT_SQL, [tenantId, clamped]);

 return rows.map(mapRowToEntry);
}

/**
 * Return the most recent audit rows for `resource`, newest first.
 *
 * Useful for compliance dashboards, incident forensics, or per-resource
 * activity feeds.
 *
 * @param resource - resource key (e.g. `Strategy:42`, `ApiKey`, `Order`)
 * @param limit - max rows (clamped to 1–100, default 100)
 * @returns `Promise<IAuditEntry[]>` — may be empty
 *
 * @throws {TypeError} If `resource` is not a non-empty string.
 *
 * @example
 * const events = await getAuditTrail('Strategy:42', 20);
 * events.forEach(e => logger.info(e.action, { result: e.result }));
 */
export async function getAuditTrail(
 resource: string,
 limit = DEFAULT_TRAIL_LIMIT,
 ): Promise<IAuditEntry[]> {
 if (typeof resource !== 'string' || resource.trim() === '') {
 throw new TypeError('resource must be a non-empty string');
 }

 const clamped = Math.min(
 Math.max(1, Math.trunc(Number(limit)) || DEFAULT_TRAIL_LIMIT),
 TRAIL_LIMIT_CEIL,
 );

 const { rows } = await query(SELECT_SQL, [resource, clamped]);

 return rows.map(mapRowToEntry);
}

/* Re-export types so consumers can import everything from this entry point */
export { type IAuditEntry, type AuditResult } from './types';
export { hashIpAddress } from './audit-ip-hash';
export { auditMiddleware } from './audit-middleware';
