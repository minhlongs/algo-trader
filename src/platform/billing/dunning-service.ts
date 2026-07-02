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

import { LicenseService } from './license-service';
import { SubscriptionService } from './subscription-service';
import { AuditLogService } from '../audit/audit-log-service';
import { DunningWorkflow } from './dunning/workflow';
import { EmailService } from '../notifications/email-service';

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
        await DunningWorkflow.suspendLicense(licenseId, existing, this.licenseService, this.auditService, this.dunningRecords);
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

      this.dunningRecords.set(existing.id, existing);
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

    this.dunningRecords.set(id, record);
    return record;
  }

  async recordPaymentSuccess(licenseId: string, _customerEmail: string, _subscriptionId?: string): Promise<DunningRecord | undefined> {
    const existing = this.getDunningRecordByLicense(licenseId);
    if (!existing) return undefined;

    const wasSuspended = existing.status === 'suspended';

    if (wasSuspended) {
      await DunningWorkflow.reinstateLicense(licenseId, existing, this.licenseService, this.auditService, this.dunningRecords);
    }

    existing.reinstatementDate = new Date().toISOString();
    existing.status = 'reinstated';
    existing.updatedAt = new Date().toISOString();
    existing.retryCount = 0;

    this.dunningRecords.set(existing.id, existing);

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
        await DunningWorkflow.suspendLicense(record.licenseId, record, this.licenseService, this.auditService, this.dunningRecords);
        suspended.push(record.licenseId);
      }
    }

    return { suspended, checked: records.length };
  }

  private async sendPaymentFailureEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] Payment Failed — Action Required';
    const body = `Hi,\n\nWe were unable to process your payment. Your account remains active, but please update your payment method to avoid service interruption.\n\nLicense: ${record.licenseId}\nAttempt: ${record.retryCount} of ${this.config.maxRetries}\nGrace Period: ${this.config.gracePeriodDays} days\n\nUpdate payment: https://cashclaw.cc/dashboard/billing\n\n— AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendEscalationEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] Urgent: Multiple Payment Failures';
    const body = `Hi,\n\nThis is your ${record.retryCount}nd/rd payment failure notice. Your account will be suspended if payment is not received within ${this.config.gracePeriodDays} days of the first failure.\n\nLicense: ${record.licenseId}\nFirst Failure: ${new Date(record.firstFailureDate).toLocaleDateString()}\n\nPlease contact support or update your payment method immediately.\n\n— AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendSuspensionEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] License Suspended';
    const body = `Hi,\n\nYour license (${record.licenseId}) has been suspended due to non-payment. All services are disabled until the outstanding balance is resolved.\n\nTo reactivate: Update your payment method or contact support.\n\n— AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private async sendReinstatementEmail(record: DunningRecord): Promise<void> {
    const subject = '[AlgoTrader] License Reinstated';
    const body = `Hi,\n\nYour license (${record.licenseId}) has been reinstated. All services are now active.\n\nThank you for resolving the payment issue.\n\n— AlgoTrader Billing`;
    await this.emailService.send({ to: record.customerEmail, subject, body });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
