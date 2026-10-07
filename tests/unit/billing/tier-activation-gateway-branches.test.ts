import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemorySubscriptionStore,
  TierActivationGateway,
} from '../../../src/billing/tier-activation-gateway';
import type { SubscriptionStore, TenantSubscriptionRecord } from '../../../src/billing/tier-activation-types';

describe('TierActivationGateway Branch Coverage', () => {
  it('returns false in verifySignature when ipnSecret is not configured', () => {
    const gateway = new TierActivationGateway({ ipnSecret: undefined });
    expect(gateway.verifySignature('body', 'sig')).toBe(false);
  });

  it('handles signature comparison exception gracefully in verifySignature', () => {
    const gateway = new TierActivationGateway({ ipnSecret: 'secret' });
    const spy = vi.spyOn(crypto, 'timingSafeEqual').mockImplementationOnce(() => {
      throw new Error('Buffer mismatch');
    });

    const validHex = crypto.createHmac('sha512', 'secret').update('test').digest('hex');
    const result = gateway.verifySignature('test', validHex);

    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('resolves default-tenant when order_id has leading colon or is empty', () => {
    const gateway = new TierActivationGateway();

    const colonOnly = gateway.resolveTenantAndTier({
      payment_id: 'p-1',
      payment_status: 'confirmed',
      price_amount: 10,
      price_currency: 'USD',
      order_id: ':PREMIUM',
    });
    expect(colonOnly.tenantId).toBe('default-tenant');
    expect(colonOnly.tier).toBe('PREMIUM');

    const descOnly = gateway.resolveTenantAndTier({
      payment_id: 'p-2',
      payment_status: 'confirmed',
      price_amount: 10,
      price_currency: 'USD',
      order_id: '',
      order_description: 'Upgrade account to MASTER tier',
    });
    expect(descOnly.tenantId).toBe('default-tenant');
    expect(descOnly.tier).toBe('MASTER');

    const noTierFallback = gateway.resolveTenantAndTier({
      payment_id: 'p-3',
      payment_status: 'confirmed',
      price_amount: 10,
      price_currency: 'USD',
      order_id: '',
      order_description: 'Generic purchase without tier',
    });
    expect(noTierFallback.tenantId).toBe('default-tenant');
    expect(noTierFallback.tier).toBe('BASIC');
  });

  it('handles persistence store failure during processPayload', async () => {
    const failingStore: SubscriptionStore = {
      getTenant: vi.fn().mockResolvedValue(null),
      saveTenant: vi.fn().mockRejectedValue(new Error('D1 Disk Full')),
      isPaymentProcessed: vi.fn().mockResolvedValue(false),
    };

    const gateway = new TierActivationGateway({ store: failingStore });
    const result = await gateway.processPayload({
      payment_id: 'pay-err-1',
      payment_status: 'confirmed',
      price_amount: 50,
      price_currency: 'USD',
      order_id: 'tenant-err:BASIC',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to persist tenant record');
  });

  it('detects duplicate payment through existing record processedPayments list', async () => {
    const existingRecord: TenantSubscriptionRecord = {
      tenantId: 'tenant-cached',
      tier: 'PREMIUM',
      strategyQuota: 20,
      paymentId: 'old-pay',
      activatedAt: '2026-10-01T00:00:00Z',
      status: 'ACTIVE',
      processedPayments: ['pay-already-seen'],
    };

    const mockStore: SubscriptionStore = {
      getTenant: vi.fn().mockResolvedValue(existingRecord),
      saveTenant: vi.fn().mockResolvedValue(undefined),
      isPaymentProcessed: vi.fn().mockResolvedValue(false),
    };

    const gateway = new TierActivationGateway({ store: mockStore });
    const result = await gateway.processPayload({
      payment_id: 'pay-already-seen',
      payment_status: 'confirmed',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-cached:PREMIUM',
    });

    expect(result.success).toBe(true);
    expect(result.isDuplicate).toBe(true);
    expect(result.tier).toBe('PREMIUM');
    expect(result.activatedAt).toBe('2026-10-01T00:00:00Z');
  });

  it('returns null entitlements for non-active tenant status', async () => {
    const store = new InMemorySubscriptionStore();
    await store.saveTenant({
      tenantId: 'tenant-suspended',
      tier: 'ENTERPRISE',
      strategyQuota: 100,
      paymentId: 'pay-susp',
      activatedAt: '2026-10-01T00:00:00Z',
      status: 'SUSPENDED',
      processedPayments: ['pay-susp'],
    });

    const gateway = new TierActivationGateway({ store });
    const entitlements = await gateway.getTenantEntitlements('tenant-suspended');
    expect(entitlements).toBeNull();
  });

  it('reads ipnSecret from environment variable when not provided in config', () => {
    const prevSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    try {
      process.env.NOWPAYMENTS_IPN_SECRET = 'env-ipn-secret';
      const gateway = new TierActivationGateway();
      const validHex = crypto.createHmac('sha512', 'env-ipn-secret').update('env-body').digest('hex');
      expect(gateway.verifySignature('env-body', validHex)).toBe(true);
    } finally {
      process.env.NOWPAYMENTS_IPN_SECRET = prevSecret;
    }
  });
});
