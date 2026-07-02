/**
 * Dunning Service
 * ROIaaS Phase 5 - License suspension/reinstatement workflow management
 *
 * Dunning Workflow:
 * 1. Payment failed -> Flag for review
 * 2. 3 payment retries over 7 days
 * 3. Auto-suspend license after 7 days
 * 4. Auto-reinstate on payment success
 *
 * Persistence: PostgreSQL dunning_state table (replaced in-memory Map in Phase 2).
 */

import { LicenseService } from './license-service';
import { SubscriptionService } from './subscription-service';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningWorkflow } from './dunning/workflow';
import { EmailService } from '../notifications/email-service';
import { getDbClient } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';

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

/** Interface for a row from the dunning_state table */
interface DunningStateRow {
  license_id: string;
  subscription_id: string | null;
  customer_email: string;
  retry_count: number;
  first_failure_date: string;
  last_failure_date: string;
  suspension_date: string | null;
  reinstatement_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export class DunningService {
  private static instance: DunningService;
  private licenseService: LicenseService;
  private subscriptionService: SubscriptionService;
  private auditService: AuditLogService;
  private emailService: EmailService;
  private config: DunningConfig;

  private constructor() {
    this.licenseService = LicenseService.getInstance();
    this.subscriptionService = SubscriptionService.getInstance();
    this.auditService = AuditLogService.getInstance();
    this.emailService = EmailService.getInstance();
    this.config = this.loadConfig();
    // Initialize email service if API key is available
    this.emailService.initialize();
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

  /**
   * Convert a DB row to a DunningRecord.
   * The `id` field is synthesized from license_id for backward compatibility.
   */
  private rowToRecord(row: DunningStateRow): DunningRecord {
    return {
      id: `dun_${row.license_id}`,
      licenseId: row.license_id,
      subscriptionId: row.subscription_id ?? undefined,
      customerEmail: row.customer_email,
      retryCount: row.retry_count,
      lastAttemptDate: row.last_failure_date,
      firstFailureDate: row.first_failure_date,
      suspensionDate: row.suspension_date ?? undefined,
      reinstatementDate: row.reinstatement_date ?? undefined,
      status: row.status as DunningStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Upsert a dunning record into the database. */
  private async upsertRecord(record: DunningRecord): Promise<void> {
    const pool = getDbClient();
    await pool.query(
      `INSERT INTO dunning_state (
        license_id, subscription_id, customer_email, retry_count,
        first_failure_date, last_failure_date, suspension_date,
        reinstatement_date, status, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (license_id) DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        customer_email = EXCLUDED.customer_email,
        retry_count = EXCLUDED.retry_count,
        first_failure_date = EXCLUDED.first_failure_date,
        last_failure_date = EXCLUDED.last_failure_date,
        suspension_date = EXCLUDED.suspension_date,
        reinstatement_date = EXCLUDED.reinstatement_date,
        status = EXCLUDED.status,
        updated_at = NOW()`,
      [
        record.licenseId,
        record.subscriptionId ?? null,
        record.customerEmail,
        record.retryCount,
        record.firstFailureDate,
        record.lastAttemptDate,
        record.suspensionDate ?? null,
        record.reinstatementDate ?? null,
        record.status,
      ],
    );
  }

  /** Load a single dunning record by license_id from the database. */
  private async loadRecordByLicense(licenseId: string): Promise<DunningRecord | undefined> {
    const pool = getDbClient();
    const result = await pool.query<DunningStateRow>(
      'SELECT * FROM dunning_state WHERE license_id = $1',
      [licenseId],
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToRecord(result.rows[0]);
  }

  /** Load all dunning records from the database. */
  private async loadAllRecords(): Promise<DunningRecord[]> {
    const pool = getDbClient();
    const result = await pool.query<DunningStateRow>(
      'SELECT * FROM dunning_state ORDER BY created_at DESC',
    );
    return result.rows.map((row) => this.rowToRecord(row));
  }

  private async saveRecord(record: DunningRecord): Promise<void> {
    await this.upsertRecord(record);
  }

  async recordPaymentFailure(licenseId: string, customerEmail: string, subscriptionId?: string): Promise<DunningRecord> {
    const existing = await this.loadRecordByLicense(licenseId);

    if (existing) {
      existing.retryCount += 1;
      existing.lastAttemptDate = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();

      const { shouldSuspend, daysSinceFirstFailure } = DunningWorkflow.shouldSuspend(
        existing.retryCount, existing.firstFailureDate, this.config
      );

      if (shouldSuspend) {
        await DunningWorkflow.suspendLicense(licenseId, existing, this.licenseService, this.auditService, this.saveRecord.bind(this));
        await this.sendSuspensionEmail(existing);
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
        // Send escalation email on 2nd+ failure
        if (existing.retryCount >= 2) {
          await this.sendEscalationEmail(existing);
        }
      }

      await this.upsertRecord(existing);
      return existing;
    }

    const id = `dun_${this.generateId()}`;
    const now = new Date().toISOString();
    const record: DunningRecord = {
      id, licenseId, subscriptionId, customerEmail, retryCount: 1,
      lastAttemptDate: now, firstFailureDate: now, status: 'active',
      createdAt: now, updatedAt: now,
    };

    // Send first payment failure email
    await this.sendPaymentFailureEmail(record);

    await this.upsertRecord(record);
    return record;
  }

  async recordPaymentSuccess(licenseId: string, _customerEmail: string, _subscriptionId?: string): Promise<DunningRecord | undefined> {
    const existing = await this.loadRecordByLicense(licenseId);
    if (!existing) return undefined;

    const wasSuspended = existing.status === 'suspended';

    if (wasSuspended) {
      await DunningWorkflow.reinstateLicense(licenseId, existing, this.licenseService, this.auditService, this.saveRecord.bind(this));
    }

    existing.reinstatementDate = new Date().toISOString();
    existing.status = 'reinstated';
    existing.updatedAt = new Date().toISOString();
    existing.retryCount = 0;

    await this.upsertRecord(existing);

    if (wasSuspended) {
      await this.sendReinstatementEmail(existing);
    }

    return existing;
  }

  async getSuspensionStatus(licenseId: string): Promise<{
    isSuspended: boolean;
    status: DunningStatus;
    retryCount: number;
    daysUntilSuspension?: number;
    suspensionDate?: string;
  }> {
    const record = await this.loadRecordByLicense(licenseId);
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

  async getAllDunningRecords(): Promise<DunningRecord[]> {
    return this.loadAllRecords();
  }

  async getDunningRecordByLicense(licenseId: string): Promise<DunningRecord | undefined> {
    return this.loadRecordByLicense(licenseId);
  }

  async checkAndSuspendExpiredGracePeriods(): Promise<{ suspended: string[]; checked: number }> {
    const records = await this.loadAllRecords();
    const suspended: string[] = [];

    for (const record of records) {
      if (record.status === 'suspended' || record.status === 'reinstated') continue;

      const { shouldSuspend } = DunningWorkflow.shouldSuspend(record.retryCount, record.firstFailureDate, this.config);
      if (shouldSuspend) {
        await DunningWorkflow.suspendLicense(record.licenseId, record, this.licenseService, this.auditService, this.saveRecord.bind(this));
        suspended.push(record.licenseId);
      }
    }

    return { suspended, checked: records.length };
  }

  private async sendPaymentFailureEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] Payment Failed - Action Required';
    const body = `Hi,\n\nWe were unable to process your payment. Your account remains active, but please update your payment method to avoid service interruption.\n\nLicense: ${record.licenseId}\nAttempt: ${record.retryCount} of ${this.config.maxRetries}\nGrace Period: ${this.config.gracePeriodDays} days\n\nUpdate payment: https://cashclaw.cc/dashboard/billing\n\n- AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendEscalationEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] Urgent: Multiple Payment Failures';
    const body = `Hi,\n\nThis is your ${record.retryCount}nd/rd payment failure notice. Your account will be suspended if payment is not received within ${this.config.gracePeriodDays} days of the first failure.\n\nLicense: ${record.licenseId}\nFirst Failure: ${new Date(record.firstFailureDate).toLocaleDateString()}\n\nPlease contact support or update your payment method immediately.\n\n- AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendSuspensionEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] License Suspended';
    const body = `Hi,\n\nYour license (${record.licenseId}) has been suspended due to non-payment. All services are disabled until the outstanding balance is resolved.\n\nTo reactivate: Update your payment method or contact support.\n\n- AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendReinstatementEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] License Reinstated';
    const body = `Hi,\n\nYour license (${record.licenseId}) has been reinstated. All services are now active.\n\nThank you for resolving the payment issue.\n\n- AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
