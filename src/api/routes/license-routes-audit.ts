import crypto from 'crypto';
import { AuditLogService } from '@platform/audit/audit-log-service';
import { logAudit, hashIpAddress } from '../../seed/security/audit-log';
import type { IAuditEntry } from '../../seed/security/audit-log';

export interface LicenseAuditTarget {
  id: string;
  tier: string;
  tenantId?: string;
}

export async function emitLicenseAudit(
  auditService: AuditLogService,
  action: 'created' | 'revoked' | 'deleted',
  license: LicenseAuditTarget,
  name?: string
): Promise<void> {
  const auditMetadata = name !== undefined ? { name } : undefined;
  await auditService.log(license.id, action, {
    tier: license.tier,
    ...(auditMetadata ? { metadata: auditMetadata } : {}),
  });

  const entryMetadata: Record<string, unknown> = {
    licenseId: license.id,
    tier: license.tier,
    ...(name !== undefined ? { name } : {}),
  };

  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'admin',
    action: `license_${action}`,
    resource: 'License',
    result: 'success',
    metadata: entryMetadata,
    ipHash: hashIpAddress(undefined),
    tenantId: license.tenantId || 'system-tenant',
  } as IAuditEntry);
}
