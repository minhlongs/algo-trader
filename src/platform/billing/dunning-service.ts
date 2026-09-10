/**
 * Dunning Service — PostgreSQL-backed persistence.
 *
 * Migration 042 creates the `dunning_state` table. This service now:
 * - Maintains an in-memory cache for fast lookups (unchanged semantics).
 * - Seeds the cache from DB on startup if DB is configured.
 * - Upserts every mutation to the DB (keep-file fallback when DB unavailable).
 */

import { LicenseService } from './license-service';
import { SubscriptionService } from './subscription-service';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningWorkflow } from './dunning/workflow';
import { logger } from '../../shared/utils/logger';
import type { DunningRecord, DunningStatus, DunningConfig } from './dunning-types';
import {
  saveToFile,
  loadFromFile,
  seedDunningFromDb,
  upsertDunningToDb,
  loadDunningConfig,
  generateDunningId,
  buildNewDunningRecord,
} from './dunning-storage';
import {
  calculateSuspensionStatus,
  processGracePeriods,
  logSuspensionWarning,
  type SuspensionStatusResult,
} from './dunning-helpers';

export type { DunningRecord, DunningStatus, DunningConfig };

export class DunningService {
  private static instance: DunningService;
  private dunningRecords: Map<string, DunningRecord> = new Map();
  private licenseService: LicenseService;
  private subscriptionService: SubscriptionService;
  private auditService: AuditLogService;
  private config: DunningConfig;
  private dbReady = false;

  /** Test-only reset. Clears cache and singleton so each test starts clean. */
  __resetForTests(): void {
    this.dunningRecords.clear();
    this.dbReady = false;
  }

  private constructor() {
    this.licenseService = LicenseService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
    this.auditService = AuditLogService.getInstance();
    this.config = this.loadConfig();

    if (process.env.NODE_ENV !== 'test') {
      this.seedFromDb().catch(() => {
        logger.warn('[Dunning] DB seed failed — using file-backed cache');
        this.dunningRecords = loadFromFile();
      });
    }
  }

  static getInstance(): DunningService {
    if (!DunningService.instance) DunningService.instance = new DunningService();
    return DunningService.instance;
  }

  private loadConfig(): DunningConfig {
    return loadDunningConfig();
  }

  private async seedFromDb(): Promise<void> {
    const res = await seedDunningFromDb();
    if (res.ready) {
      this.dunningRecords = res.records;
      this.dbReady = true;
    } else {
      this.dbReady = false;
    }
  }

  private async upsertRecord(record: DunningRecord): Promise<void> {
    this.dunningRecords.set(record.licenseId, record);
    if (this.dbReady) {
      const ok = await upsertDunningToDb(record);
      if (ok) return;
    }
    saveToFile(this.dunningRecords);
  }

  /** Persist a single dunning record (Promise-returning callback for Inngest). */
  saveDunningRecord(record: DunningRecord): Promise<void> {
    this.dunningRecords.set(record.licenseId, record);
    this.upsertRecord(record).catch(() => {});
    return Promise.resolve();
  }

  async recordPaymentFailure(
    licenseId: string,
    customerEmail: string,
    subscriptionId?: string,
  ): Promise<DunningRecord> {
    const existing = this.getDunningRecordByLicense(licenseId);

    if (existing) {
      existing.retryCount += 1;
      existing.lastAttemptDate = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();

      const { shouldSuspend, daysSinceFirstFailure } = DunningWorkflow.shouldSuspend(
        existing.retryCount,
        existing.firstFailureDate,
        this.config,
      );

      if (shouldSuspend) {
        await DunningWorkflow.suspendLicense(licenseId, existing, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
      } else {
        existing.status = 'warning';
        await logSuspensionWarning(this.auditService, licenseId, existing.retryCount, this.config, daysSinceFirstFailure);
      }

      await this.upsertRecord(existing);
      return existing;
    }

    return this.createDunningRecord(licenseId, customerEmail, subscriptionId);
  }

  async createDunningRecord(
    licenseId: string,
    customerEmail: string,
    subscriptionId?: string,
  ): Promise<DunningRecord> {
    const record = buildNewDunningRecord(licenseId, customerEmail, subscriptionId);
    this.dunningRecords.set(record.licenseId, record);
    await this.upsertRecord(record);
    return record;
  }

  async recordPaymentSuccess(
    licenseId: string,
    _customerEmail: string,
    _subscriptionId?: string,
  ): Promise<DunningRecord | undefined> {
    const existing = this.getDunningRecordByLicense(licenseId);
    if (!existing) return undefined;

    if (existing.status === 'suspended') {
      await DunningWorkflow.reinstateLicense(licenseId, existing, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
    }

    existing.reinstatementDate = new Date().toISOString();
    existing.status = 'reinstated';
    existing.updatedAt = new Date().toISOString();
    existing.retryCount = 0;

    await this.upsertRecord(existing);
    return existing;
  }

  async getSuspensionStatus(licenseId: string): Promise<SuspensionStatusResult> {
    return calculateSuspensionStatus(this.getDunningRecordByLicense(licenseId), this.config);
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
    return processGracePeriods(this.getAllDunningRecords(), this.config, async (record) => {
      await DunningWorkflow.suspendLicense(record.licenseId, record, this.licenseService, this.auditService, this.saveDunningRecord.bind(this));
    });
  }

  private generateId(): string {
    return generateDunningId();
  }
}
