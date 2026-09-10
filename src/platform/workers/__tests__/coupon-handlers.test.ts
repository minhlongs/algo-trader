/**
 * Tests for coupon-handlers — seedCoupons KV seeding + facade re-exports.
 *
 * seedCoupons is idempotent: writes LAUNCH20 only when absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockValidate,
  mockRedeem,
  mockApply,
  mockActivate,
} = vi.hoisted(() => ({
  mockValidate: vi.fn(),
  mockRedeem: vi.fn(),
  mockApply: vi.fn(),
  mockActivate: vi.fn(),
}));

vi.mock('../coupon-validate', () => ({ handleValidateCoupon: mockValidate }));
vi.mock('../coupon-redeem', () => ({ handleRedeemCoupon: mockRedeem }));
vi.mock('../coupon-apply', () => ({ handleApplyCoupon: mockApply, handleActivateCoupon: mockActivate }));

import { seedCoupons } from '../coupon-handlers';
import {
  handleValidateCoupon,
  handleApplyCoupon,
  handleRedeemCoupon,
  handleActivateCoupon,
} from '../coupon-handlers';

function makeEnv(existing: string | null = null) {
  return {
    CACHE: {
      get: vi.fn().mockResolvedValue(existing),
      put: vi.fn().mockResolvedValue(undefined),
    },
  } as never;
}

describe('seedCoupons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds the LAUNCH20 coupon when KV is empty', async () => {
    const env = makeEnv(null);

    await seedCoupons(env);

    expect(env.CACHE.put).toHaveBeenCalledTimes(1);
    const [key, value] = env.CACHE.put.mock.calls[0];
    expect(key).toBe('coupon:LAUNCH20');
    const coupon = JSON.parse(value);
    expect(coupon).toMatchObject({
      code: 'LAUNCH20',
      discountPercent: 20,
      maxUses: 100,
      currentUses: 0,
      applicableTiers: ['STARTER', 'PRO', 'ELITE'],
      active: true,
    });
    expect(coupon.validUntil).toBe('2026-07-30T00:00:00.000Z');
  });

  it('is a no-op when the coupon already exists', async () => {
    const env = makeEnv('{"code":"LAUNCH20"}');

    await seedCoupons(env);

    expect(env.CACHE.put).not.toHaveBeenCalled();
  });

  it('seeds with a fresh createdAt timestamp', async () => {
    const env = makeEnv(null);

    await seedCoupons(env);

    const coupon = JSON.parse(env.CACHE.put.mock.calls[0][1]);
    expect(coupon.createdAt).toEqual(expect.any(String));
    expect(new Date(coupon.createdAt).getTime()).not.toBeNaN();
  });
});

describe('coupon-handlers facade re-exports', () => {
  it('re-exports the four handlers from their leaf modules', () => {
    expect(handleValidateCoupon).toBe(mockValidate);
    expect(handleRedeemCoupon).toBe(mockRedeem);
    expect(handleApplyCoupon).toBe(mockApply);
    expect(handleActivateCoupon).toBe(mockActivate);
  });
});
