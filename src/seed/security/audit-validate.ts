/**
 * Validation helpers for audit-log entries.
 *
 * @module security/audit-validate
 */

import { ZodError } from 'zod';
import type { IAuditEntry, AuditResult } from './types';
import {
  METADATA_MAX_BYTES,
  auditEntrySchema,
  validateAuditEntryWithZod,
} from './schemas/audit-entry-schema';

export { METADATA_MAX_BYTES, auditEntrySchema, validateAuditEntryWithZod };

/** Allowed values for `IAuditEntry.result`. */
export const VALID_RESULTS: readonly AuditResult[] = ['success', 'failure', 'denied'];

/** Throw `TypeError` if any field on `entry` is missing or has the wrong type. */
export function validateEntry(entry: IAuditEntry): void {
  try {
    auditEntrySchema.parse(entry);
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0];
      throw new TypeError(firstIssue?.message || 'Invalid audit entry');
    }
    throw err;
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
