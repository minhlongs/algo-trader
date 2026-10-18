/**
 * Audit Export Formatting & Query Helpers
 * Pure SQL query construction and CSV/JSON row serialization for audit log exports.
 */

export const CSV_HEADER =
  'id,tenant_id,sequence_number,event_type,action_by,reason,metadata,hash,previous_hash,created_at\n';

export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildAuditExportQuery(
  filters: { eventType?: string; startDate?: string; endDate?: string },
  targetTenantId: string | null,
): { sql: string; params: unknown[] } {
  let sql = 'SELECT * FROM tenant_audit_logs WHERE 1=1';
  const params: unknown[] = [];

  if (targetTenantId) {
    params.push(targetTenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  if (filters.eventType) {
    params.push(filters.eventType);
    sql += ` AND event_type = $${params.length}`;
  }
  if (filters.startDate) {
    params.push(filters.startDate);
    sql += ` AND created_at >= $${params.length}`;
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    sql += ` AND created_at <= $${params.length}`;
  }

  sql += targetTenantId ? ' ORDER BY sequence_number DESC' : ' ORDER BY created_at DESC, id DESC';
  return { sql, params };
}

export function formatAuditRowCsv(row: Record<string, unknown>): string {
  const metadataStr =
    typeof row.metadata === 'string'
      ? (row.metadata as string)
      : JSON.stringify(row.metadata || {});
  return [
    row.id,
    row.tenant_id,
    parseInt(row.sequence_number as string, 10),
    row.event_type,
    row.action_by,
    row.reason || '',
    metadataStr,
    row.hash,
    row.previous_hash || '',
    new Date(row.created_at as string | Date).toISOString(),
  ]
    .map(escapeCsv)
    .join(',');
}

export function formatAuditRowJson(row: Record<string, unknown>): string {
  const metadata =
    typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : row.metadata;
  return JSON.stringify({
    id: row.id,
    tenant_id: row.tenant_id,
    sequence_number: parseInt(row.sequence_number as string, 10),
    event_type: row.event_type,
    action_by: row.action_by,
    reason: row.reason,
    metadata,
    hash: row.hash,
    previous_hash: row.previous_hash,
    created_at: row.created_at,
  });
}
