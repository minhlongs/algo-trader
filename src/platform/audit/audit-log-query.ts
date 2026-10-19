import { query } from '../../db/postgres-client.js';
import type { IAuditEntry } from '../../seed/security/audit-log';
import { AuditLogValidators } from './validators';
import type { AuditLog, AuditEventType, AuditLogFilters } from './audit-log-types';

export const SELECT_BY_LICENSE_SQL = `
  SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
  FROM audit_log
  WHERE tenant_id = $1
  ORDER BY "timestamp" DESC
  LIMIT $2
`;

export const SELECT_ALL_SQL = `
  SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
  FROM audit_log
  ORDER BY "timestamp" DESC
  LIMIT $1
`;

export function mapRowToAuditLog(entry: IAuditEntry): AuditLog {
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  return {
    id: entry.id,
    licenseId: entry.tenantId ?? entry.actor,
    event: entry.action as AuditEventType,
    createdAt: entry.timestamp,
    metadata,
    tier: metadata.tier as string | undefined,
  };
}

export async function fetchLogsByLicense(
  licenseId: string,
  filters: AuditLogFilters,
  defaultBatchSize: number
): Promise<AuditLog[]> {
  const limit = filters.limit ?? defaultBatchSize;
  const { rows } = await query(SELECT_BY_LICENSE_SQL, [licenseId, limit]);
  return AuditLogValidators.filterLogs(
    rows.map((r) => mapRowToAuditLog(r as unknown as IAuditEntry)),
    { ...filters, licenseId }
  );
}

export async function fetchAllLogs(
  filters: AuditLogFilters,
  defaultBatchSize: number
): Promise<AuditLog[]> {
  const limit = filters.limit ?? defaultBatchSize;
  const { rows } = await query(SELECT_ALL_SQL, [limit]);
  return AuditLogValidators.filterLogs(
    rows.map((r) => mapRowToAuditLog(r as unknown as IAuditEntry)),
    filters
  );
}

export async function fetchRecentActivity(limit: number): Promise<AuditLog[]> {
  const { rows } = await query(SELECT_ALL_SQL, [limit]);
  return AuditLogValidators.getRecentActivity(
    rows.map((r) => mapRowToAuditLog(r as unknown as IAuditEntry)),
    limit
  );
}
