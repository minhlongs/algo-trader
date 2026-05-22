/**
 * Subscription Service
 * Payment provider-agnostic subscription lifecycle management
 * Supports NOWPayments (crypto) as primary provider
 */

import * as fs from 'fs';
import * as path from 'path';
import { LicenseService } from './license-service';
import { AuditLogService } from '../audit/audit-log-service';
import { LicenseTier, LicenseStatus } from '../types/license';

const STORE_PATH = process.env.SUBSCRIPTION_STORE_PATH
  || path.join(process.cwd(), 'data', 'subscriptions.json');

function saveToFile(subscriptions: Map<string, Subscription>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(Array.from(subscriptions.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

function loadFromFile(): Map<string, Subscription> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, Subscription][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

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

export class SubscriptionService {
  private static instance: SubscriptionService;
  private subscriptions: Map<string, Subscription> = new Map();
  private licenseService: LicenseService;
  private auditService: AuditLogService;

  private constructor() {
    this.licenseService = LicenseService.getInstance();
    this.auditService = AuditLogService.getInstance();
    this.subscriptions = loadFromFile();
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) SubscriptionService.instance = new SubscriptionService();
    return SubscriptionService.instance;
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

  async getSubscription(id: string): Promise<Subscription | undefined> {
    return this.subscriptions.get(id);
  }

  async getSubscriptionByProviderId(providerId: string): Promise<Subscription | undefined> {
    for (const sub of this.subscriptions.values()) {
      if (sub.providerPaymentId === providerId) return sub;
    }
    return undefined;
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

  async updateSubscriptionTier(id: string, tier: LicenseTier): Promise<Subscription | undefined> {
    const sub = this.subscriptions.get(id);
    if (!sub) return undefined;

    sub.tier = tier;
    sub.updatedAt = new Date().toISOString();
    this.subscriptions.set(id, sub);
    saveToFile(this.subscriptions);

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

    sub.licenseId = license.id;
    sub.updatedAt = new Date().toISOString();
    this.subscriptions.set(id, sub);
    saveToFile(this.subscriptions);

    await this.auditService.log(license.id, 'activated', {
      tier: sub.tier,
      metadata: { paymentId: sub.providerPaymentId, customerEmail: sub.customerEmail },
    });

    return sub;
  }

  async cancelSubscription(id: string): Promise<Subscription | undefined> {
    const sub = await this.updateSubscriptionStatus(id, 'cancelled');
    if (!sub) return undefined;

    if (sub.licenseId) await this.downgradeLicenseToFree(sub.licenseId);
    return sub;
  }

  private async syncLicenseTier(licenseId: string, tier: LicenseTier): Promise<void> {
    const license = this.licenseService.getLicense(licenseId);
    if (license) {
      license.tier = tier;
      license.updatedAt = new Date().toISOString();
      license.maxUsage = this.getDefaultMaxUsage(tier);
    }
  }

  private async downgradeLicenseToFree(licenseId: string): Promise<void> {
    const license = this.licenseService.getLicense(licenseId);
    if (license) {
      license.tier = LicenseTier.FREE;
      license.status = LicenseStatus.ACTIVE;
      license.updatedAt = new Date().toISOString();
      license.maxUsage = this.getDefaultMaxUsage(LicenseTier.FREE);

      await this.auditService.log(licenseId, 'revoked', {
        tier: LicenseTier.FREE,
        metadata: { reason: 'subscription_cancelled' },
      });
    }
  }

  private getDefaultMaxUsage(tier: LicenseTier): number {
    switch (tier) {
      case LicenseTier.FREE: return 100;
      case LicenseTier.PRO: return 10000;
      case LicenseTier.ENTERPRISE: return 100000;
    }
  }

  async getAllSubscriptions(): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values());
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
