/**
 * Subscription Service
 * Payment provider-agnostic subscription lifecycle management
 * Supports NOWPayments (crypto) as primary provider
 * Storage: PostgreSQL via postgres-client
 */

import { query } from '../../shared/db/postgres-client';
import { LicenseService } from './license-service';
import { AuditLogService } from '../audit/audit-log-service';
import { LicenseTier, LicenseStatus } from '../../shared/types/license';

export interface Subscription {
  id: string;
  providerPaymentId: string;
  customerEmail: string;
  productId: string;
  status: SubscriptionStatus;
  tier: LicenseTier;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount?: number;
  currency?: string;
  licenseId?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export interface CreateSubscriptionInput {
  providerPaymentId: string;
  customerEmail: string;
  productId: string;
  status: SubscriptionStatus;
  tier: LicenseTier;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount?: number;
  currency?: string;
}

function rowToSubscription(row: any): Subscription {
  const toDateString = (val: unknown): string => {
    if (!val) return new Date().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return String(val);
  };

  return {
    id: row.id,
    providerPaymentId: row.provider_payment_id,
    customerEmail: row.customer_email,
    productId: row.product_id ?? undefined,
    status: row.status as SubscriptionStatus,
    tier: row.tier as LicenseTier,
    currentPeriodStart: toDateString(row.current_period_start),
    currentPeriodEnd: toDateString(row.current_period_end),
    amount: row.amount != null ? Number(row.amount) : undefined,
    currency: row.currency ?? undefined,
    licenseId: row.license_id ?? undefined,
    createdAt: toDateString(row.created_at),
    updatedAt: toDateString(row.updated_at),
    cancelledAt: row.cancelled_at ? toDateString(row.cancelled_at) : undefined,
  };
}

export class SubscriptionService {
  private static instance: SubscriptionService;
  private licenseService: LicenseService;
  private auditService: AuditLogService;

  private constructor() {
    this.licenseService = LicenseService.getInstance();
    this.auditService = AuditLogService.getInstance();
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) SubscriptionService.instance = new SubscriptionService();
    return SubscriptionService.instance;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const id = `sub_${this.generateId()}`;
    const now = new Date().toISOString();

    const result = await query(
      `INSERT INTO subscriptions (id, provider_payment_id, customer_email, product_id, status, tier, current_period_start, current_period_end, amount, currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id,
        input.providerPaymentId,
        input.customerEmail,
        input.productId ?? null,
        input.status,
        input.tier,
        input.currentPeriodStart,
        input.currentPeriodEnd,
        input.amount ?? null,
        input.currency ?? null,
        now,
        now,
      ]
    );

    return rowToSubscription(result.rows[0]);
  }

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const result = await query('SELECT * FROM subscriptions WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return rowToSubscription(result.rows[0]);
  }

  async getSubscriptionByProviderId(providerId: string): Promise<Subscription | undefined> {
    const result = await query('SELECT * FROM subscriptions WHERE provider_payment_id = $1', [providerId]);
    if (result.rows.length === 0) return undefined;
    return rowToSubscription(result.rows[0]);
  }

  async getSubscriptionsByCustomer(customerEmail: string): Promise<Subscription[]> {
    const result = await query('SELECT * FROM subscriptions WHERE customer_email = $1', [customerEmail]);
    return result.rows.map(rowToSubscription);
  }

  async updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<Subscription | undefined> {
    const now = new Date().toISOString();

    let result;
    if (status === 'cancelled') {
      result = await query(
        'UPDATE subscriptions SET status = $1, updated_at = $2, cancelled_at = $2 WHERE id = $3 RETURNING *',
        [status, now, id]
      );
    } else {
      result = await query(
        'UPDATE subscriptions SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
        [status, now, id]
      );
    }

    if (result.rows.length === 0) return undefined;
    return rowToSubscription(result.rows[0]);
  }

  async updateSubscriptionTier(id: string, tier: LicenseTier): Promise<Subscription | undefined> {
    const now = new Date().toISOString();

    const result = await query(
      'UPDATE subscriptions SET tier = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [tier, now, id]
    );

    if (result.rows.length === 0) return undefined;

    const sub = rowToSubscription(result.rows[0]);
    if (sub.licenseId) await this.syncLicenseTier(sub.licenseId, tier);
    return sub;
  }

  async activateSubscription(id: string): Promise<Subscription | undefined> {
    const sub = await this.updateSubscriptionStatus(id, 'active');
    if (!sub) return undefined;

    const license = await this.licenseService.createLicense({
      name: `Subscription ${sub.providerPaymentId}`,
      tier: sub.tier,
      expiresAt: sub.currentPeriodEnd,
    });

    const now = new Date().toISOString();
    const updateResult = await query(
      'UPDATE subscriptions SET license_id = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [license.id, now, id]
    );

    const updatedSub = updateResult.rows[0] ? rowToSubscription(updateResult.rows[0]) : undefined;

    if (updatedSub) {
      await this.auditService.log(license.id, 'activated', {
        tier: updatedSub.tier,
        metadata: { paymentId: updatedSub.providerPaymentId, customerEmail: updatedSub.customerEmail },
      });
    }

    return updatedSub;
  }

  async cancelSubscription(id: string): Promise<Subscription | undefined> {
    const sub = await this.updateSubscriptionStatus(id, 'cancelled');
    if (!sub) return undefined;

    if (sub.licenseId) await this.downgradeLicenseToFree(sub.licenseId);
    return sub;
  }

  private async syncLicenseTier(licenseId: string, tier: LicenseTier): Promise<void> {
    const license = await this.licenseService.getLicense(licenseId);
    if (license) {
      await query(
        'UPDATE licenses SET tier = $1, max_usage = $2, updated_at = $3 WHERE id = $4',
        [tier, this.getDefaultMaxUsage(tier), new Date().toISOString(), licenseId]
      );
    }
  }

  private async downgradeLicenseToFree(licenseId: string): Promise<void> {
    const license = await this.licenseService.getLicense(licenseId);
    if (license) {
      const now = new Date().toISOString();
      await query(
        'UPDATE licenses SET tier = $1, status = $2, max_usage = $3, updated_at = $4 WHERE id = $5',
        [LicenseTier.FREE, LicenseStatus.ACTIVE, this.getDefaultMaxUsage(LicenseTier.FREE), now, licenseId]
      );

      await this.auditService.log(licenseId, 'revoked', {
        tier: LicenseTier.FREE,
        metadata: { reason: 'subscription_cancelled' },
      });
    }
  }

  private getDefaultMaxUsage(tier: LicenseTier): number {
    switch (tier) {
      case LicenseTier.FREE:        return 100;
      case LicenseTier.PRO:         return 10000;
      case LicenseTier.ENTERPRISE:  return 100000;
      case LicenseTier.MASTER:      return 500000;
    }
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    const result = await query('SELECT * FROM subscriptions');
    return result.rows.map(rowToSubscription);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
