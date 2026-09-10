/**
 * Subscription License and Payment Processing Helpers
 */

import type { LicenseService } from './license-service';
import type { AuditLogService } from '../audit/audit-log-service';
import { LicenseTier, LicenseStatus } from '../../shared/types/license';
import type { Subscription } from './subscription-types';
import { saveToFile } from './subscription-storage';

export function getDefaultMaxUsage(tier: LicenseTier): number {
  const limits: Record<LicenseTier, number> = {
    [LicenseTier.FREE]: 100,
    [LicenseTier.STARTER]: 5000,
    [LicenseTier.PRO]: 10000,
    [LicenseTier.ENTERPRISE]: 100000,
    [LicenseTier.MASTER]: 500000,
  };
  return limits[tier] ?? 100;
}

export async function syncLicenseTier(
  licenseService: LicenseService,
  licenseId: string,
  tier: LicenseTier
): Promise<void> {
  const license = licenseService.getLicense(licenseId);
  if (license) {
    license.tier = tier;
    license.updatedAt = new Date().toISOString();
    license.maxUsage = getDefaultMaxUsage(tier);
  }
}

export async function downgradeLicenseToFree(
  licenseService: LicenseService,
  auditService: AuditLogService,
  licenseId: string
): Promise<void> {
  const license = licenseService.getLicense(licenseId);
  if (license) {
    license.tier = LicenseTier.FREE;
    license.status = LicenseStatus.ACTIVE;
    license.updatedAt = new Date().toISOString();
    license.maxUsage = getDefaultMaxUsage(LicenseTier.FREE);

    try {
      await auditService.log(licenseId, 'revoked', {
        tier: LicenseTier.FREE,
        metadata: { reason: 'subscription_cancelled' },
      });
    } catch {
      // non-blocking: audit infra may be unavailable in tests
    }
  }
}

export function handleUserPaymentConfirmation(
  subscriptions: Map<string, Subscription>,
  input: {
    userId: string;
    tier: LicenseTier;
    paymentId?: string;
    amount?: number;
    currency?: string;
  },
  generateId: () => string
): Subscription {
  const tier =
    typeof input.tier === 'string'
      ? (LicenseTier[input.tier.toUpperCase() as keyof typeof LicenseTier] || LicenseTier.PRO)
      : input.tier;
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const existing = Array.from(subscriptions.values()).find((s) => s.userId && s.userId === input.userId);
  if (existing) {
    existing.status = 'active';
    existing.tier = tier;
    existing.updatedAt = now;
    existing.currentPeriodEnd = periodEnd;
    if (input.amount) existing.amount = input.amount;
    if (input.currency) existing.currency = input.currency;
    subscriptions.set(existing.id, existing);
    saveToFile(subscriptions);
    return existing;
  }

  const id = `sub_${generateId()}`;
  const subscription: Subscription = {
    id,
    userId: input.userId,
    providerPaymentId: input.paymentId || `pay_${id}`,
    customerEmail: `${input.userId}@test.local`,
    productId: 'default-product',
    status: 'active',
    tier,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    amount: input.amount,
    currency: input.currency,
    createdAt: now,
    updatedAt: now,
  };
  subscriptions.set(id, subscription);
  saveToFile(subscriptions);
  return subscription;
}

export function handleUserCancellation(
  subscriptions: Map<string, Subscription>,
  userId: string
): void {
  const sub = Array.from(subscriptions.values()).find((s) => s.userId === userId);
  if (!sub) return;
  sub.status = 'cancelled';
  sub.cancelledAt = new Date().toISOString();
  sub.updatedAt = new Date().toISOString();
  subscriptions.set(sub.id, sub);
  saveToFile(subscriptions);
}
