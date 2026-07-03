/**
 * Dunning Workflow
 * License suspension/reinstatement workflow helpers
 *
 * The `saveRecord` callback replaces the in-memory Map for persistence.
 * Callers (e.g. DunningService) provide DB-backed or test-specific save logic.
 */

import { LicenseService } from '../license-service';
import { AuditLogService } from '../../audit/audit-log-service';
import { LicenseStatus } from '../../../shared/types/license';
import { query } from '../../../shared/db/postgres-client';
import type { DunningRecord, DunningConfig } from '../dunning-service';

export class DunningWorkflow {
  static async suspendLicense(
    licenseId: string,
    record: DunningRecord,
    licenseService: LicenseService,
    auditService: AuditLogService,
    saveRecord: (record: DunningRecord) => Promise<void>,
  ): Promise<void> {
    const license = await licenseService.getLicense(licenseId);
    if (!license) return;

    await licenseService.revokeLicense(licenseId);

    record.status = 'suspended';
    record.suspensionDate = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    await saveRecord(record);

    await auditService.log(licenseId, 'revoked', {
      metadata: {
        eventType: 'suspended',
        retryCount: record.retryCount,
        reason: 'payment_failed_dunning',
      },
    });
  }

  static async reinstateLicense(
    licenseId: string,
    record: DunningRecord,
    licenseService: LicenseService,
    auditService: AuditLogService,
    saveRecord: (record: DunningRecord) => Promise<void>,
  ): Promise<void> {
    const license = await licenseService.getLicense(licenseId);
    if (!license) return;

    const now = new Date().toISOString();
    await query(
      'UPDATE licenses SET status = $1, updated_at = $2 WHERE id = $3',
      [LicenseStatus.ACTIVE, now, licenseId]
    );

    record.status = 'reinstated';
    record.reinstatementDate = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    await saveRecord(record);

    await auditService.log(licenseId, 'activated', {
      metadata: {
        eventType: 'reinstated',
        reason: 'payment_success',
      },
    });
  }

  static getDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  static shouldSuspend(
    retryCount: number,
    firstFailureDate: string,
    config: DunningConfig
  ): { shouldSuspend: boolean; daysSinceFirstFailure: number } {
    const daysSinceFirstFailure = this.getDaysSince(firstFailureDate);
    const shouldSuspend =
      retryCount >= config.maxRetries ||
      daysSinceFirstFailure >= config.gracePeriodDays;

    return { shouldSuspend, daysSinceFirstFailure };
  }

  static getDaysUntilSuspension(
    firstFailureDate: string,
    config: DunningConfig
  ): number {
    const daysSinceFirstFailure = this.getDaysSince(firstFailureDate);
    return Math.max(0, config.gracePeriodDays - daysSinceFirstFailure);
  }
}
