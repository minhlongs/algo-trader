/**
 * Dunning Service — PostgreSQL-backed persistence.
 *
 * Migration 042 creates the `dunning_state` table. This service now:
 * - Maintains an in-memory cache for fast lookups (unchanged semantics).
 * - Seeds the cache from DB on startup if DB is configured.
 * - Upserts every mutation to the DB (keep-file fallback when DB unavailable).
 */

import * as fs from 'fs';
import * as path from 'path';
import { LicenseService } from './license-service';
import { SubscriptionService } from './subscription-service';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningWorkflow } from './dunning/workflow';
import { getDbClient } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';

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

    // Seed cache from DB in production; start clean in test mode so
    // beforeEach() isolation works without stale singleton state.
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
    return {
      enabled: process.env.DUNNING_ENABLED !== 'false',
      maxRetries: parseInt(process.env.DUNNING_MAX_RETRIES || '3', 10),
      gracePeriodDays: parseInt(process.env.DUNNING_GRACE_PERIOD_DAYS || '7', 10),
    };
  }

  // ── DB helpers ────────────────────────────────────────────────────────────────

  private async getPool() {
    return getDbClient();
  }

  private async seedFromDb(): Promise<void> {
    try {
      const pool = await this.getPool();
      const { rows } = await pool.query('SELECT * FROM dunning_state');
      this.dunningRecords.clear();
      for (const row of rows) {
        const record: DunningRecord = {
          id: row.license_id,
          licenseId: row.license_id,
          subscriptionId: row.subscription_id,
          customerEmail: row.customer_email,
          retryCount: row.retry_count,
          lastAttemptDate: row.last_failure_date,
          firstFailureDate: row.first_failure_date,
          suspensionDate: row.suspension_date,
          reinstatementDate: row.reinstatement_date,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        this.dunningRecords.set(record.licenseId, record);
      }
      this.dbReady = true;
    } catch {
      this.dbReady = false;
    }
  }

  private async upsertRecord(record: DunningRecord): Promise<void> {
    // Update cache — key by licenseId so lookups are O(1).
    // The DB primary key is also license_id, so this aligns cache with DB.
    this.dunningRecords.set(record.licenseId, record);

    // Try DB first
    if (this.dbReady) {
      try {
        const pool = await this.getPool();
        await pool.query(
          `INSERT INTO dunning_state
            (license_id, subscription_id, customer_email, retry_count,
             first_failure_date, last_failure_date, suspension_date,
             reinstatement_date, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (license_id) DO UPDATE SET
             subscription_id = EXCLUDED.subscription_id,
             customer_email = EXCLUDED.customer_email,
             retry_count = EXCLUDED.retry_count,
             last_failure_date = EXCLUDED.last_failure_date,
             suspension_date = EXCLUDED.suspension_date,
             reinstatement_date = EXCLUDED.reinstatement_date,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
          [
            record.licenseId,
            record.subscriptionId,
            record.customerEmail,
            record.retryCount,
            record.firstFailureDate,
            record.lastAttemptDate,
            record.suspensionDate,
            record.reinstatementDate,
            record.status,
            record.createdAt,
            record.updatedAt,
          ],
        );
        return;
      } catch (err) {
        logger.warn('[Dunning] DB upsert failed, falling back to file', { err: String(err) });
      }
    }

    // Fallback: file
    saveToFile(this.dunningRecords);
  }

  // ── Public API (unchanged signatures) ────────────────────────────────────────

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
    const id = `dun_${this.generateId()}`;
    const now = new Date().toISOString();
    const record: DunningRecord = {
      id,
      licenseId,
      subscriptionId,
      customerEmail,
      retryCount: 1,
      lastAttemptDate: now,
      firstFailureDate: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

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
