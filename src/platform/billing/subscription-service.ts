/**
 * Subscription Service
 * Payment provider-agnostic subscription lifecycle management
 * Supports NOWPayments (crypto) as primary provider
 */

import { LicenseService } from './license-service';
import { AuditLogService } from '../audit/audit-log-service';
import { type LicenseTier } from '../../shared/types/license';
import {
  type Subscription,
  type SubscriptionStatus,
  type CreateSubscriptionInput,
} from './subscription-types';
import { saveToFile, clearStoreFile, loadFromFile } from './subscription-storage';
import {
  getDefaultMaxUsage,
  syncLicenseTier,
  downgradeLicenseToFree,
  handleUserPaymentConfirmation,
  handleUserCancellation,
} from './subscription-helpers';

export * from './subscription-types';
export * from './subscription-storage';
export * from './subscription-helpers';

export class SubscriptionService {
  private static instance: SubscriptionService | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private licenseService!: LicenseService;
  private auditService!: AuditLogService;

  constructor() {
    if (SubscriptionService.instance) return SubscriptionService.instance as SubscriptionService;
    this.licenseService = LicenseService.getInstance();
    this.auditService = AuditLogService.getInstance();
    this.subscriptions = loadFromFile();
    SubscriptionService.instance = this;
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  static resetInstance(): void {
    clearStoreFile();
    SubscriptionService.instance = null;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const id = `sub_${this.generateId()}`;
    const now = new Date().toISOString();
    const subscription: Subscription = {
      id,
      providerPaymentId: input.providerPaymentId,
      customerEmail: input.customerEmail,
      productId: input.productId,
      status: input.status,
      tier: input.tier,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      amount: input.amount,
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    };
    this.subscriptions.set(id, subscription);
    saveToFile(this.subscriptions);
    return subscription;
  }

  async getSubscription(idOrUserId: string): Promise<Subscription | undefined> {
    const byId = this.subscriptions.get(idOrUserId);
    if (byId) return byId;
    return Array.from(this.subscriptions.values()).find((s) => s.userId === idOrUserId);
  }

  async getSubscriptionByProviderId(providerId: string): Promise<Subscription | undefined> {
    return Array.from(this.subscriptions.values()).find((s) => s.providerPaymentId === providerId);
  }

  async getSubscriptionsByCustomer(customerEmail: string): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values()).filter((s) => s.customerEmail === customerEmail);
  }

  async updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<Subscription | undefined> {
    const sub = this.subscriptions.get(id);
    if (!sub) return undefined;

    sub.status = status;
    sub.updatedAt = new Date().toISOString();
    if (status === 'cancelled') sub.cancelledAt = new Date().toISOString();

    this.subscriptions.set(id, sub);
    saveToFile(this.subscriptions);
    return sub;
  }

  async updateSubscriptionTier(id: string, tier: LicenseTier, licenseId?: string): Promise<Subscription | undefined> {
    const sub = this.subscriptions.get(id);
    if (!sub) return undefined;

    sub.tier = tier;
    sub.updatedAt = new Date().toISOString();
    this.subscriptions.set(id, sub);
    if (licenseId) sub.licenseId = licenseId;
    saveToFile(this.subscriptions);

    if (sub.licenseId) await syncLicenseTier(this.licenseService, sub.licenseId, tier);
    return sub;
  }

  async activateSubscription(id: string): Promise<Subscription | undefined> {
    const existing = this.subscriptions.get(id);
    if (!existing) return undefined;

    existing.status = 'active';
    existing.updatedAt = new Date().toISOString();

    const license = await this.licenseService.createLicense({
      name: existing.customerEmail,
      tier: existing.tier,
    });
    license.userId = existing.customerEmail;
    license.maxUsage = getDefaultMaxUsage(existing.tier);
    license.subscriptionId = id;
    existing.licenseId = license.id;

    this.subscriptions.set(id, existing);
    saveToFile(this.subscriptions);
    return existing;
  }

  async cancelSubscription(id: string): Promise<Subscription | undefined> {
    const sub = this.subscriptions.get(id);
    if (!sub) return undefined;

    sub.status = 'cancelled';
    sub.cancelledAt = new Date().toISOString();
    sub.updatedAt = new Date().toISOString();
    this.subscriptions.set(id, sub);
    saveToFile(this.subscriptions);

    if (sub.licenseId) {
      await downgradeLicenseToFree(this.licenseService, this.auditService, sub.licenseId);
    }
    return sub;
  }

  async handlePaymentConfirmation(input: {
    userId: string;
    tier: LicenseTier;
    paymentId?: string;
    amount?: number;
    currency?: string;
  }): Promise<Subscription> {
    return handleUserPaymentConfirmation(this.subscriptions, input, () => this.generateId());
  }

  async handleCancellation(userId: string): Promise<void> {
    handleUserCancellation(this.subscriptions, userId);
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values());
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
