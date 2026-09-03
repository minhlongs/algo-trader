/**
 * Coupon Service Tests
 * Target: 100% coverage for src/platform/billing/coupon-service.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CouponService } from '../coupon-service';
import type { Coupon } from '../coupon-service';

// Mock logger — must match the specifier the SUT imports
// (coupon-service.ts: `import { logger } from '../../shared/utils/logger'`,
//  which resolves to src/shared/utils/logger.ts from the SUT's directory).
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../../shared/utils/logger';

// Mock fs to avoid real file I/O. The SUT uses both `import ... from 'fs'`
// and a `require('fs')` inside save(); vitest's mock covers both when the
// module id is 'fs' and the factory returns the named bindings.
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

function createMockCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'TEST10',
    discountPercent: 10,
    maxUses: 100,
    currentUses: 0,
    validUntil: null,
    applicableTiers: [],
    createdAt: new Date().toISOString(),
    active: true,
    ...overrides,
  };
}

describe('CouponService', () => {
  let service: CouponService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton (keep module cache so fs mocks stay valid)
    (CouponService as any).instance = undefined;

    // Default fs mocks
    (existsSync as any).mockReturnValue(false);
    (readFileSync as any).mockReturnValue('[]');

    service = CouponService.getInstance();
  });

  afterEach(() => {
    (CouponService as any).instance = undefined;
  });

  describe('singleton', () => {
    it('returns same instance on multiple calls', () => {
      const s1 = CouponService.getInstance();
      const s2 = CouponService.getInstance();
      expect(s1).toBe(s2);
    });

    it('loads coupons on first instantiation', () => {
      expect(existsSync).toHaveBeenCalled();
    });
  });

  describe('createCoupon', () => {
    it('creates coupon with all required fields', () => {
      const coupon = service.createCoupon({
        code: 'SAVE20',
        discountPercent: 20,
        maxUses: 50,
        validUntil: '2025-12-31',
        applicableTiers: ['STARTER', 'PRO'],
      });

      expect(coupon.code).toBe('SAVE20');
      expect(coupon.discountPercent).toBe(20);
      expect(coupon.maxUses).toBe(50);
      expect(coupon.validUntil).toBe('2025-12-31');
      expect(coupon.applicableTiers).toEqual(['STARTER', 'PRO']);
      expect(coupon.currentUses).toBe(0);
      expect(coupon.active).toBe(true);
      expect(coupon.createdAt).toBeDefined();
    });

    it('normalizes code to uppercase', () => {
      const coupon = service.createCoupon({ code: '  save20  ', discountPercent: 10 });
      expect(coupon.code).toBe('SAVE20');
    });

    it('defaults maxUses to 0 (unlimited)', () => {
      const coupon = service.createCoupon({ code: 'UNLIMITED', discountPercent: 15 });
      expect(coupon.maxUses).toBe(0);
    });

    it('defaults validUntil to null', () => {
      const coupon = service.createCoupon({ code: 'NOEXPIRY', discountPercent: 10 });
      expect(coupon.validUntil).toBeNull();
    });

    it('defaults applicableTiers to empty array', () => {
      const coupon = service.createCoupon({ code: 'ALLTIERS', discountPercent: 10 });
      expect(coupon.applicableTiers).toEqual([]);
    });

    it('throws if coupon already exists', () => {
      service.createCoupon({ code: 'DUPLICATE', discountPercent: 10 });
      expect(() => service.createCoupon({ code: 'duplicate', discountPercent: 20 })).toThrow('Coupon DUPLICATE already exists');
    });

    it('throws if discountPercent < 1', () => {
      expect(() => service.createCoupon({ code: 'LOW', discountPercent: 0 })).toThrow('Discount must be 1-100%');
    });

    it('throws if discountPercent > 100', () => {
      expect(() => service.createCoupon({ code: 'HIGH', discountPercent: 101 })).toThrow('Discount must be 1-100%');
    });

    it('saves to disk after creation', () => {
      service.createCoupon({ code: 'SAVES', discountPercent: 10 });
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('logs creation', () => {
      service.createCoupon({ code: 'LOGGED', discountPercent: 25 });
      expect(logger.info).toHaveBeenCalledWith('[Coupon] Created: LOGGED (25% off)');
    });
  });

  describe('applyCoupon', () => {
    beforeEach(() => {
      service.createCoupon({ code: 'VALID10', discountPercent: 10, maxUses: 100, applicableTiers: ['STARTER', 'PRO'] });
      service.createCoupon({ code: 'EXPIRED', discountPercent: 20, validUntil: '2020-01-01' });
      service.createCoupon({ code: 'LIMITED', discountPercent: 15, maxUses: 2 });
      service.createCoupon({ code: 'TIERED', discountPercent: 30, applicableTiers: ['ENTERPRISE'] });
      service.createCoupon({ code: 'INACTIVE', discountPercent: 5, active: false });
    });

    it('returns valid result with discounted price', () => {
      const result = service.applyCoupon('VALID10', 'STARTER', 100);
      expect(result.valid).toBe(true);
      expect(result.discountedPrice).toBe(90);
      expect(result.discountPercent).toBe(10);
      expect(result.error).toBeUndefined();
    });

    it('rounds discounted price to 2 decimal places', () => {
      service.createCoupon({ code: 'ROUND', discountPercent: 33 });
      const result = service.applyCoupon('ROUND', 'STARTER', 100);
      expect(result.discountedPrice).toBe(67); // 100 * 0.67 = 67
    });

    it('caps discounted price at 0 (100% discount)', () => {
      service.createCoupon({ code: 'FREE', discountPercent: 100 });
      const result = service.applyCoupon('FREE', 'STARTER', 50);
      expect(result.discountedPrice).toBe(0);
    });

    it('rejects non-existent coupon', () => {
      const result = service.applyCoupon('NONEXISTENT', 'STARTER', 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid coupon code');
      expect(result.discountedPrice).toBe(100);
    });

    it('rejects inactive coupon', () => {
      const result = service.applyCoupon('INACTIVE', 'STARTER', 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid coupon code');
    });

    it('rejects expired coupon', () => {
      const result = service.applyCoupon('EXPIRED', 'STARTER', 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon expired');
    });

    it('rejects coupon at max uses', () => {
      service.recordUse('LIMITED');
      service.recordUse('LIMITED');
      const result = service.applyCoupon('LIMITED', 'STARTER', 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon usage limit reached');
    });

    it('rejects coupon for wrong tier', () => {
      const result = service.applyCoupon('TIERED', 'STARTER', 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon not valid for STARTER');
    });

    it('accepts coupon with no tier restriction', () => {
      service.createCoupon({ code: 'ANYTIER', discountPercent: 10 });
      const result = service.applyCoupon('ANYTIER', 'FREE', 100);
      expect(result.valid).toBe(true);
    });

    it('normalizes tier to uppercase', () => {
      const result = service.applyCoupon('VALID10', 'starter', 100);
      expect(result.valid).toBe(true);
    });

    it('normalizes code to uppercase', () => {
      const result = service.applyCoupon('valid10', 'STARTER', 100);
      expect(result.valid).toBe(true);
    });
  });

  describe('recordUse', () => {
    it('increments currentUses and saves', () => {
      service.createCoupon({ code: 'USEME', discountPercent: 10, maxUses: 5 });
      service.recordUse('USEME');
      service.recordUse('USEME');

      const coupon = (service as any).coupons.get('USEME');
      expect(coupon.currentUses).toBe(2);
      expect(writeFileSync).toHaveBeenCalledTimes(3); // 1 create + 2 recordUse
    });

    it('logs use count', () => {
      service.createCoupon({ code: 'LOGUSE', discountPercent: 10, maxUses: 3 });
      service.recordUse('LOGUSE');
      expect(logger.info).toHaveBeenCalledWith('[Coupon] Use recorded: LOGUSE (1/3)');
    });

    it('does nothing for non-existent coupon', () => {
      service.recordUse('NONEXISTENT');
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('listCoupons', () => {
    it('returns empty array when no coupons', () => {
      const coupons = service.listCoupons();
      expect(coupons).toEqual([]);
    });

    it('returns all coupons', () => {
      service.createCoupon({ code: 'A', discountPercent: 10 });
      service.createCoupon({ code: 'B', discountPercent: 20 });
      service.createCoupon({ code: 'C', discountPercent: 30 });

      const coupons = service.listCoupons();
      expect(coupons).toHaveLength(3);
      expect(coupons.map(c => c.code).sort()).toEqual(['A', 'B', 'C']);
    });
  });

  describe('deactivateCoupon', () => {
    it('deactivates existing coupon', () => {
      service.createCoupon({ code: 'DEACT', discountPercent: 10 });
      const result = service.deactivateCoupon('DEACT');
      expect(result).toBe(true);

      const coupon = (service as any).coupons.get('DEACT');
      expect(coupon.active).toBe(false);
    });

    it('returns false for non-existent coupon', () => {
      const result = service.deactivateCoupon('NONEXISTENT');
      expect(result).toBe(false);
    });

    it('saves after deactivation', () => {
      service.createCoupon({ code: 'DEACTSAVE', discountPercent: 10 });
      service.deactivateCoupon('DEACTSAVE');
      expect(writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('normalizes code to uppercase', () => {
      service.createCoupon({ code: 'UPPER', discountPercent: 10 });
      service.deactivateCoupon('upper');
      const coupon = (service as any).coupons.get('UPPER');
      expect(coupon.active).toBe(false);
    });
  });

  describe('load (private, via fs)', () => {
    it('loads coupons from existing file', () => {
      const savedCoupons = [
        createMockCoupon({ code: 'LOADED1', discountPercent: 15 }),
        createMockCoupon({ code: 'LOADED2', discountPercent: 25, maxUses: 50 }),
      ];
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue(JSON.stringify(savedCoupons));

      // Create new instance to trigger load
      (CouponService as any).instance = undefined;
      const newService = CouponService.getInstance();

      expect(newService.listCoupons()).toHaveLength(2);
      expect(logger.info).toHaveBeenCalledWith('[Coupon] Loaded 2 coupons from disk');
    });

    it('handles corrupted JSON gracefully', () => {
      (existsSync as any).mockReturnValue(true);
      (readFileSync as any).mockReturnValue('not valid json');

      (CouponService as any).instance = undefined;
      const newService = CouponService.getInstance();

      expect(newService.listCoupons()).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('[Coupon] Failed to load coupons file', expect.any(Error));
    });

    it('handles missing file gracefully', () => {
      (existsSync as any).mockReturnValue(false);

      (CouponService as any).instance = undefined;
      const newService = CouponService.getInstance();

      expect(newService.listCoupons()).toEqual([]);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('save (private, via fs)', () => {
    it('creates data directory if missing', () => {
      (existsSync as any).mockReturnValueOnce(false); // for dir
      service.createCoupon({ code: 'DIR', discountPercent: 10 });
      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('data'), { recursive: true });
    });

    it('logs error on save failure', () => {
      (writeFileSync as any).mockImplementation(() => { throw new Error('disk full'); });
      service.createCoupon({ code: 'FAILSAVE', discountPercent: 10 });
      expect(logger.error).toHaveBeenCalledWith('[Coupon] Failed to save coupons file', expect.any(Error));
    });
  });

  describe('integration: full coupon lifecycle', () => {
    it('create -> apply -> recordUse -> deactivate', () => {
      // Create
      const coupon = service.createCoupon({
        code: 'LIFECYCLE',
        discountPercent: 20,
        maxUses: 3,
        applicableTiers: ['PRO'],
      });
      expect(coupon.code).toBe('LIFECYCLE');

      // Apply valid
      const applied = service.applyCoupon('LIFECYCLE', 'PRO', 150);
      expect(applied.valid).toBe(true);
      expect(applied.discountedPrice).toBe(120);

      // Record use twice
      service.recordUse('LIFECYCLE');
      service.recordUse('LIFECYCLE');
      let status = (service as any).coupons.get('LIFECYCLE');
      expect(status.currentUses).toBe(2);

      // Apply again (still valid, 1 use left)
      const applied2 = service.applyCoupon('LIFECYCLE', 'PRO', 100);
      expect(applied2.valid).toBe(true);

      // Record last use
      service.recordUse('LIFECYCLE');
      status = (service as any).coupons.get('LIFECYCLE');
      expect(status.currentUses).toBe(3);

      // Apply at limit -> rejected
      const applied3 = service.applyCoupon('LIFECYCLE', 'PRO', 100);
      expect(applied3.valid).toBe(false);
      expect(applied3.error).toBe('Coupon usage limit reached');

      // Deactivate
      service.deactivateCoupon('LIFECYCLE');
      status = (service as any).coupons.get('LIFECYCLE');
      expect(status.active).toBe(false);
    });
  });
});