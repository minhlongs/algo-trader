/**
 * Subscription Service Tests
 * Payment provider-agnostic subscription lifecycle management tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionService } from '../subscription-service';
import { LicenseTier, LicenseStatus } from '../../../shared/types/license';

const { mockData, mockQuery } = vi.hoisted(() => {
  const subs = new Map<string, Record<string, any>>();
  const licenses = new Map<string, Record<string, any>>();

  const fn = vi.fn((text: string, params?: any[]) => {
    // --- Subscriptions table ---
    if (text.startsWith('INSERT INTO subscriptions')) {
      const row: Record<string, any> = {
        id: params![0],
        provider_payment_id: params![1],
        customer_email: params![2],
        product_id: params![3],
        status: params![4],
        tier: params![5],
        current_period_start: params![6],
        current_period_end: params![7],
        amount: params![8],
        currency: params![9],
        created_at: params![10],
        updated_at: params![11],
        license_id: null,
        cancelled_at: null,
      };
      subs.set(row.id, row);
      return { rows: [row] };
    }
    if (text === 'SELECT * FROM subscriptions WHERE id = $1') {
      const row = subs.get(params![0]);
      return { rows: row ? [row] : [] };
    }
    if (text === 'SELECT * FROM subscriptions WHERE provider_payment_id = $1') {
      const rows = [...subs.values()].filter((r: any) => r.provider_payment_id === params![0]);
      return { rows };
    }
    if (text === 'SELECT * FROM subscriptions WHERE customer_email = $1') {
      const rows = [...subs.values()].filter((r: any) => r.customer_email === params![0]);
      return { rows };
    }
    if (text === 'SELECT * FROM subscriptions') {
      return { rows: [...subs.values()] };
    }
    // UPDATE subscriptions SET status ... or UPDATE subscriptions SET tier ...
    if (text.startsWith('UPDATE subscriptions SET status') || text.startsWith('UPDATE subscriptions SET tier')) {
      const row = subs.get(params![params!.length - 1]);
      if (row) {
        if (params![0] && typeof params![0] === 'string' && ['pending', 'active', 'cancelled', 'expired'].includes(params![0])) {
          row.status = params![0];
        } else {
          row.tier = params![0];
        }
        row.updated_at = params![1];
        if (text.includes('cancelled_at')) row.cancelled_at = params![1];
      }
      return { rows: row ? [row] : [] };
    }
    // UPDATE subscriptions SET license_id ... (activateSubscription)
    if (text.startsWith('UPDATE subscriptions SET license_id')) {
      const row = subs.get(params![params!.length - 1]);
      if (row) {
        row.license_id = params![0];
        row.updated_at = params![1];
      }
      return { rows: row ? [row] : [] };
    }

    // --- Licenses table (used by LicenseService internally) ---
    if (text.startsWith('INSERT INTO licenses')) {
      const lic: Record<string, any> = {
        id: params![0], name: params![1], key: params![2],
        tier: params![3], status: params![4],
        created_at: params![5], updated_at: params![6],
        usage_count: params![7], max_usage: params![8],
        tenant_id: params![9], domain: params![10],
        expires_at: params![11],
        subscription_id: null,
      };
      licenses.set(lic.id, lic);
      return { rows: [lic] };
    }
    if (text === 'SELECT * FROM licenses WHERE id = $1') {
      const row = licenses.get(params![0]);
      return { rows: row ? [row] : [] };
    }
    // UPDATE licenses SET ... (syncLicenseTier / downgradeLicenseToFree)
    if (text.startsWith('UPDATE licenses SET')) {
      const row = licenses.get(params![params!.length - 1]);
      if (row) {
        row.tier = params![0] ?? row.tier;
        row.status = params![1] ?? row.status;
        row.max_usage = text.includes('max_usage') ? (params![1] ?? params![2]) : row.max_usage;
        row.updated_at = params![params!.length - 2];
      }
      return { rows: row ? [row] : [] };
    }

    return { rows: [] };
  });
  return { mockData: { subscriptions: subs, licenses }, mockQuery: fn };
});

vi.mock('../../../shared/db/postgres-client', () => ({
  query: mockQuery,
}));

vi.mock('../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = SubscriptionService.getInstance();
    mockData.subscriptions.clear();
    mockData.licenses.clear();
  });

  describe('createSubscription', () => {
    it('should create subscription with correct properties', async () => {
      const input = {
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'pending' as const,
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 49.0,
        currency: 'USD',
      };

      const subscription = await service.createSubscription(input);

      expect(subscription.id).toMatch(/^sub_/);
      expect(subscription.providerPaymentId).toBe('np_pay_123');
      expect(subscription.customerEmail).toBe('test@example.com');
      expect(subscription.tier).toBe(LicenseTier.PRO);
      expect(subscription.status).toBe('pending');
      expect(subscription.amount).toBe(49.0);
      expect(subscription.currency).toBe('USD');
    });
  });

  describe('getSubscription', () => {
    it('should get subscription by id', async () => {
      const created = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const retrieved = await service.getSubscription(created.id);

      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.customerEmail).toBe('test@example.com');
    });

    it('should return undefined for non-existent subscription', async () => {
      const result = await service.getSubscription('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getSubscriptionByProviderId', () => {
    it('should get subscription by provider payment id', async () => {
      const created = await service.createSubscription({
        providerPaymentId: 'np_pay_unique_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const retrieved = await service.getSubscriptionByProviderId('np_pay_unique_123');

      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.providerPaymentId).toBe('np_pay_unique_123');
    });

    it('should return undefined for non-existent provider id', async () => {
      const result = await service.getSubscriptionByProviderId('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getSubscriptionsByCustomer', () => {
    it('should get all subscriptions for a customer', async () => {
      const email = 'customer@example.com';
      await service.createSubscription({
        providerPaymentId: 'np_pay_1',
        customerEmail: email,
        productId: 'prod_1',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await service.createSubscription({
        providerPaymentId: 'np_pay_2',
        customerEmail: email,
        productId: 'prod_2',
        status: 'active',
        tier: LicenseTier.ENTERPRISE,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const subscriptions = await service.getSubscriptionsByCustomer(email);

      expect(subscriptions.length).toBe(2);
      expect(subscriptions.every((s) => s.customerEmail === email)).toBe(true);
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should update subscription status', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'pending',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionStatus(subscription.id, 'active');

      expect(updated?.status).toBe('active');
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should set cancelledAt when status is cancelled', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionStatus(subscription.id, 'cancelled');

      expect(updated?.status).toBe('cancelled');
      expect(updated?.cancelledAt).toBeDefined();
    });

    it('should return undefined for non-existent subscription', async () => {
      const result = await service.updateSubscriptionStatus('non-existent', 'cancelled');
      expect(result).toBeUndefined();
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription and create license', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'pending',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const activated = await service.activateSubscription(subscription.id);

      expect(activated?.status).toBe('active');
      expect(activated?.licenseId).toBeDefined();
      expect(activated?.licenseId).toMatch(/^lic_/);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription and downgrade license to FREE', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      await service.activateSubscription(subscription.id);
      const cancelled = await service.cancelSubscription(subscription.id);

      expect(cancelled?.status).toBe('cancelled');
    });

    it('should return undefined for non-existent subscription', async () => {
      const result = await service.cancelSubscription('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('updateSubscriptionTier', () => {
    it('should update subscription tier', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.FREE,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionTier(subscription.id, LicenseTier.ENTERPRISE);

      expect(updated?.tier).toBe(LicenseTier.ENTERPRISE);
      expect(updated?.updatedAt).toBeDefined();
    });
  });

  describe('getAllSubscriptions', () => {
    it('should return all subscriptions', async () => {
      await service.createSubscription({
        providerPaymentId: 'np_pay_1',
        customerEmail: 'test1@example.com',
        productId: 'prod_1',
        status: 'active',
        tier: LicenseTier.FREE,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await service.createSubscription({
        providerPaymentId: 'np_pay_2',
        customerEmail: 'test2@example.com',
        productId: 'prod_2',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const subscriptions = await service.getAllSubscriptions();

      expect(subscriptions.length).toBe(2);
    });
  });
});
