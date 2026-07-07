/**
 * Dunning Service
 * ROIaaS Phase 5 - License suspension/reinstatement workflow management
 *
 * Dunning Workflow:
 * 1. Payment failed → Flag for review
 * 2. 3 payment retries over 7 days
 * 3. Auto-suspend license after 7 days
 * 4. Auto-reinstate on payment success
 */

import * as fs from 'fs';
import * as path from 'path';
import { LicenseService } from './license-service';
import { SubscriptionService } from './subscription-service';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningWorkflow } from './dunning/workflow';

const STORE_PATH = process.env.DUNNING_STORE_PATH
  || path.join(process.cwd(), 'data', 'dunning.json');

function saveToFile(records: Map<string, DunningRecord>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(Array.from(records.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

function loadFromFile(): Map<string, DunningRecord> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, DunningRecord][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export interface DunningRecord {
  id: string;
  licenseId: string;
  subscriptionId?: string;
  customerEmail: string;
  retryCount: number;
  lastAttemptDate: string;
  firstFailureDate: string;
  suspensionDate?: string;
  reinstatementDate?: string;
  status: DunningStatus;
  createdAt: string;
  updatedAt: string;
}

export type DunningStatus = 'active' | 'warning' | 'suspended' | 'reinstated';

export interface DunningConfig {
  enabled: boolean;
  maxRetries: number;
  gracePeriodDays: number;
}

export class DunningService {
  private static instance: DunningService;
  private dunningRecords: Map<string, DunningRecord> = new Map();
  private licenseService: LicenseService;
  private subscriptionService: SubscriptionService;
  private auditService: AuditLogService;
  private config: DunningConfig;

  private constructor() {
    this.licenseService = LicenseService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
    this.auditService = AuditLogService.getInstance();
    this.config = this.loadConfig();
    this.dunningRecords = loadFromFile();
  }

  /** Persist a single dunning record (Promise-returning callback for Inngest). */
  saveDunningRecord(record: DunningRecord): Promise<void> {
    this.dunningRecords.set(record.licenseId, record);
    return Promise.resolve();
  }

  static getInstance(): DunningService {
    if (!DunningService.instance) DunningService.instance = new DunningService();
    return DunningService.instance;
  }

  private loadConfig(): DunningConfig {
    return {
      enabled: process.env.DUNNING_ENABLED !== 'false',
      maxRetries: parseInt(process.env.DUNNING_MAX_RETRIES || '3', 10),
      gracePeriodDays: parseInt(process.env.DUNNING_GRACE_PERIOD_DAYS || '7', 10),
    };
  }

  async recordPaymentFailure(licenseId: string, customerEmail: string, subscriptionId?: string): Promise<DunningRecord> {
    const existing = this.getDunningRecordByLicense(licenseId);

    if (existing) {
      existing.retryCount += 1;
      existing.lastAttemptDate = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();

      const { shouldSuspend, daysSinceFirstFailure } = DunningWorkflow.shouldSuspend(
        existing.retryCount, existing.firstFailureDate, this.config
      );

      if (shouldSuspend) {
        await DunningWorkflow.suspendLicense(licenseId, existing, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
      } else {
        existing.status = 'warning';
        await this.auditService.log(licenseId, 'rate_limit', {
          metadata: {
            eventType: 'suspension_warning',
            retryCount: existing.retryCount,
            maxRetries: this.config.maxRetries,
            gracePeriodDays: this.config.gracePeriodDays,
            daysSinceFirstFailure,
          },
        });
      }

      this.dunningRecords.set(existing.id, existing);
      saveToFile(this.dunningRecords);
      return existing;
    }

    const id = `dun_${this.generateId()}`;
    const now = new Date().toISOString();
    const record: DunningRecord = {
      id, licenseId, subscriptionId, customerEmail, retryCount: 1,
      lastAttemptDate: now, firstFailureDate: now, status: 'active',
      createdAt: now, updatedAt: now,
    };

    this.dunningRecords.set(id, record);
    saveToFile(this.dunningRecords);
    return record;
  }

  async recordPaymentSuccess(licenseId: string, _customerEmail: string, _subscriptionId?: string): Promise<DunningRecord | undefined> {
    const existing = this.getDunningRecordByLicense(licenseId);
    if (!existing) return undefined;

    if (existing.status === 'suspended') {
      await DunningWorkflow.reinstateLicense(licenseId, existing, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
    }

    existing.reinstatementDate = new Date().toISOString();
    existing.status = 'reinstated';
    existing.updatedAt = new Date().toISOString();
    existing.retryCount = 0;

    this.dunningRecords.set(existing.id, existing);
    saveToFile(this.dunningRecords);
    return existing;
  }

  async getSuspensionStatus(licenseId: string): Promise<{
    isSuspended: boolean;
    status: DunningStatus;
    retryCount: number;
    daysUntilSuspension?: number;
    suspensionDate?: string;
  }> {
    const record = this.getDunningRecordByLicense(licenseId);
    if (!record) return { isSuspended: false, status: 'active', retryCount: 0 };

    if (record.status === 'suspended') {
      return { isSuspended: true, status: 'suspended', retryCount: record.retryCount, suspensionDate: record.suspensionDate };
    }

    return {
      isSuspended: false,
      status: record.status,
      retryCount: record.retryCount,
      daysUntilSuspension: DunningWorkflow.getDaysUntilSuspension(record.firstFailureDate, this.config),
    };
  }

  getAllDunningRecords(): DunningRecord[] {
    return Array.from(this.dunningRecords.values());
  }

  getDunningRecordByLicense(licenseId: string): DunningRecord | undefined {
    for (const record of this.dunningRecords.values()) {
      if (record.licenseId === licenseId) return record;
    }
    return undefined;
  }

  async checkAndSuspendExpiredGracePeriods(): Promise<{ suspended: string[]; checked: number }> {
    const records = this.getAllDunningRecords();
    const suspended: string[] = [];

    for (const record of records) {
      if (record.status === 'suspended' || record.status === 'reinstated') continue;

      const { shouldSuspend } = DunningWorkflow.shouldSuspend(record.retryCount, record.firstFailureDate, this.config);
      if (shouldSuspend) {
        await DunningWorkflow.suspendLicense(record.licenseId, record, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
        suspended.push(record.licenseId);
      }
    }

    return { suspended, checked: records.length };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
