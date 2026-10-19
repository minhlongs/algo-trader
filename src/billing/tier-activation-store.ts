/**
 * Tier Activation Store
 * In-memory implementation of SubscriptionStore for testing and defaults.
 */

import type { SubscriptionStore, TenantSubscriptionRecord } from './tier-activation-types';

export class InMemorySubscriptionStore implements SubscriptionStore {
  private tenants = new Map<string, TenantSubscriptionRecord>();
  private processed = new Set<string>();

  async getTenant(tenantId: string): Promise<TenantSubscriptionRecord | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async saveTenant(record: TenantSubscriptionRecord): Promise<void> {
    this.tenants.set(record.tenantId, { ...record });
    record.processedPayments.forEach((p) => this.processed.add(p));
  }

  async isPaymentProcessed(paymentId: string): Promise<boolean> {
    return this.processed.has(paymentId);
  }
}
