import { describe, expect, it, vi } from 'vitest';
import {
  createKvTierInvalidator,
  invalidateTenantCache,
  type KvNamespaceLike,
} from '../../../src/billing/tier-cache-invalidator';

describe('Tier Cache Invalidator', () => {
  it('evicts tier cache key from KV namespace on event', async () => {
    const mockKv: KvNamespaceLike = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const invalidator = createKvTierInvalidator(mockKv);
    await invalidator('tenant-alpha', {
      status: 'refunded',
      paymentId: 'pay-123',
      previousTier: 'PREMIUM',
    });

    expect(mockKv.delete).toHaveBeenCalledTimes(1);
    expect(mockKv.delete).toHaveBeenCalledWith('tier:tenant-alpha');
  });

  it('safely handles missing KV namespace without throwing', async () => {
    const invalidator = createKvTierInvalidator(undefined);
    await expect(
      invalidator('tenant-beta', {
        status: 'expired',
        paymentId: 'pay-456',
      })
    ).resolves.toBeUndefined();
  });

  it('catches and logs KV deletion errors without propagating exception', async () => {
    const failingKv: KvNamespaceLike = {
      delete: vi.fn().mockRejectedValue(new Error('Cloudflare API 500')),
    };

    const invalidator = createKvTierInvalidator(failingKv);
    await expect(
      invalidator('tenant-gamma', {
        status: 'failed',
        paymentId: 'pay-789',
      })
    ).resolves.toBeUndefined();

    expect(failingKv.delete).toHaveBeenCalledWith('tier:tenant-gamma');
  });

  it('invalidates tenant cache directly via invalidateTenantCache helper', async () => {
    const mockKv: KvNamespaceLike = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateTenantCache('tenant-delta', mockKv, 'chargeback');

    expect(mockKv.delete).toHaveBeenCalledTimes(1);
    expect(mockKv.delete).toHaveBeenCalledWith('tier:tenant-delta');
  });
});
