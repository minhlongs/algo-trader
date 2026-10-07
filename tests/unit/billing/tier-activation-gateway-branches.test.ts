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

  it('successfully verifies unsorted JSON payload via alphabetical key sorting (ksort)', () => {
    const secret = 'ksort-secret';
    const gateway = new TierActivationGateway({ ipnSecret: secret });
    const rawPayload = '{"z_status":"finished","a_amount":100,"m_order":"tenant-1:PRO"}';
    const sortedPayload = '{"a_amount":100,"m_order":"tenant-1:PRO","z_status":"finished"}';
    const validSignature = crypto.createHmac('sha512', secret).update(sortedPayload).digest('hex');

    expect(gateway.verifySignature(rawPayload, validSignature)).toBe(true);
  });

  it('triggers onTierInvalidation and marks record CANCELLED when status is refunded', async () => {
    const store = new InMemorySubscriptionStore();
    await store.saveTenant({
      tenantId: 'tenant-refund-me',
      tier: 'PREMIUM',
      strategyQuota: 20,
      paymentId: 'pay-orig',
      activatedAt: '2026-10-01T00:00:00Z',
      status: 'ACTIVE',
      processedPayments: ['pay-orig'],
    });

    const mockInvalidator = vi.fn();
    const gateway = new TierActivationGateway({ store, onTierInvalidation: mockInvalidator });

    const result = await gateway.processPayload({
      payment_id: 'pay-refund',
      payment_status: 'refunded',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-refund-me:PREMIUM',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Payment status 'refunded' is not confirmed");

    const updated = await store.getTenant('tenant-refund-me');
    expect(updated?.status).toBe('CANCELLED');

    expect(mockInvalidator).toHaveBeenCalledTimes(1);
    expect(mockInvalidator).toHaveBeenCalledWith('tenant-refund-me', {
      status: 'refunded',
      paymentId: 'pay-refund',
      previousTier: 'PREMIUM',
    });

    const entitlements = await gateway.getTenantEntitlements('tenant-refund-me');
    expect(entitlements).toBeNull();
  });

  it('marks record EXPIRED when payment status is expired', async () => {
    const store = new InMemorySubscriptionStore();
    await store.saveTenant({
      tenantId: 'tenant-expire-me',
      tier: 'ENTERPRISE',
      strategyQuota: 100,
      paymentId: 'pay-exp-1',
      activatedAt: '2026-10-01T00:00:00Z',
      status: 'ACTIVE',
      processedPayments: ['pay-exp-1'],
    });

    const mockInvalidator = vi.fn();
    const gateway = new TierActivationGateway({ store, onTierInvalidation: mockInvalidator });

    const result = await gateway.processPayload({
      payment_id: 'pay-exp-2',
      payment_status: 'expired',
      price_amount: 199,
      price_currency: 'USD',
      order_id: 'tenant-expire-me:ENTERPRISE',
    });

    expect(result.success).toBe(false);
    const updated = await store.getTenant('tenant-expire-me');
    expect(updated?.status).toBe('EXPIRED');
    expect(mockInvalidator).toHaveBeenCalledWith('tenant-expire-me', {
      status: 'expired',
      paymentId: 'pay-exp-2',
      previousTier: 'ENTERPRISE',
    });
  });

  it('handles onTierInvalidation callback errors gracefully without throwing', async () => {
    const store = new InMemorySubscriptionStore();
    await store.saveTenant({
      tenantId: 'tenant-fail-cb',
      tier: 'BASIC',
      strategyQuota: 5,
      paymentId: 'pay-1',
      activatedAt: '2026-10-01T00:00:00Z',
      status: 'ACTIVE',
      processedPayments: ['pay-1'],
    });

    const failingInvalidator = vi.fn().mockRejectedValue(new Error('KV connection timed out'));
    const gateway = new TierActivationGateway({ store, onTierInvalidation: failingInvalidator });

    const result = await gateway.processPayload({
      payment_id: 'pay-failed-status',
      payment_status: 'failed',
      price_amount: 29,
      price_currency: 'USD',
      order_id: 'tenant-fail-cb:BASIC',
    });

    expect(result.success).toBe(false);
    const updated = await store.getTenant('tenant-fail-cb');
    expect(updated?.status).toBe('CANCELLED');
    expect(failingInvalidator).toHaveBeenCalledTimes(1);
  });
});
