import type { DunningRecord, DunningStatus, DunningConfig } from './dunning-types';
import { DunningWorkflow } from './dunning/workflow';
import type { AuditLogService } from '../audit/audit-log-service';
import type { LicenseService } from './license-service';

export interface SuspensionStatusResult {
  isSuspended: boolean;
  status: DunningStatus;
  retryCount: number;
  daysUntilSuspension?: number;
  suspensionDate?: string;
}

export function calculateSuspensionStatus(
  record: DunningRecord | undefined,
  config: DunningConfig,
): SuspensionStatusResult {
  if (!record) return { isSuspended: false, status: 'active', retryCount: 0 };

  if (record.status === 'suspended') {
    return {
      isSuspended: true,
      status: 'suspended',
      retryCount: record.retryCount,
      suspensionDate: record.suspensionDate,
    };
  }

  return {
    isSuspended: false,
    status: record.status,
    retryCount: record.retryCount,
    daysUntilSuspension: DunningWorkflow.getDaysUntilSuspension(record.firstFailureDate, config),
  };
}

export async function processGracePeriods(
  records: DunningRecord[],
  config: DunningConfig,
  suspendFn: (record: DunningRecord) => Promise<void>,
): Promise<{ suspended: string[]; checked: number }> {
  const suspended: string[] = [];

  for (const record of records) {
    if (record.status === 'suspended' || record.status === 'reinstated') continue;

    const { shouldSuspend } = DunningWorkflow.shouldSuspend(record.retryCount, record.firstFailureDate, config);
    if (shouldSuspend) {
      await suspendFn(record);
      suspended.push(record.licenseId);
    }
  }

  return { suspended, checked: records.length };
}

export async function logSuspensionWarning(
  auditService: AuditLogService,
  licenseId: string,
  retryCount: number,
  config: DunningConfig,
  daysSinceFirstFailure: number,
): Promise<void> {
  await auditService.log(licenseId, 'rate_limit', {
    metadata: {
      eventType: 'suspension_warning',
      retryCount,
      maxRetries: config.maxRetries,
      gracePeriodDays: config.gracePeriodDays,
      daysSinceFirstFailure,
    },
  });
}

export async function processExistingFailure(
  existing: DunningRecord,
  config: DunningConfig,
  licenseService: LicenseService,
  auditService: AuditLogService,
  saveFn: (record: DunningRecord) => Promise<void>,
): Promise<DunningRecord> {
  existing.retryCount += 1;
  existing.lastAttemptDate = new Date().toISOString();
  existing.updatedAt = new Date().toISOString();

  const { shouldSuspend, daysSinceFirstFailure } = DunningWorkflow.shouldSuspend(
    existing.retryCount,
    existing.firstFailureDate,
    config,
  );

  if (shouldSuspend) {
    await DunningWorkflow.suspendLicense(existing.licenseId, existing, licenseService, auditService, saveFn);
  } else {
    existing.status = 'warning';
    await logSuspensionWarning(auditService, existing.licenseId, existing.retryCount, config, daysSinceFirstFailure);
  }
  return existing;
}

export async function processExistingPaymentSuccess(
  existing: DunningRecord,
  licenseService: LicenseService,
  auditService: AuditLogService,
  saveFn: (record: DunningRecord) => Promise<void>,
): Promise<DunningRecord> {
  if (existing.status === 'suspended') {
    await DunningWorkflow.reinstateLicense(existing.licenseId, existing, licenseService, auditService, saveFn);
  }
  existing.reinstatementDate = new Date().toISOString();
  existing.status = 'reinstated';
  existing.updatedAt = new Date().toISOString();
  existing.retryCount = 0;
  return existing;
}
