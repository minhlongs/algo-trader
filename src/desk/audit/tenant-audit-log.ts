/** Stub: Tenant-scoped audit log append helper. */
export interface AuditLogEntry {
  tenantId: string;
  eventType: string;
  actor: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function appendTenantAuditLog(
  tenantId: string,
  eventType: string,
  actor: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // no-op stub — real implementation writes to persistent store
}

export class TenantAuditLog {
  async append(entry: Omit<AuditLogEntry, 'tenantId'>, tenantId: string): Promise<void> {
    await appendTenantAuditLog(tenantId, entry.eventType, entry.actor, entry.message, entry.metadata);
  }
}
