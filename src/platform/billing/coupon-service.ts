/**
 * Coupon Service
 * Manages discount codes — persisted to JSON file so coupons survive PM2 restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../../shared/utils/logger';

export interface Coupon {
  code: string;
  discountPercent: number;       // 0-100
  maxUses: number;               // 0 = unlimited
  currentUses: number;
  validUntil: string | null;     // ISO date or null = no expiry
  applicableTiers: string[];     // ['STARTER','PRO','ELITE'] or empty = all
  createdAt: string;
  active: boolean;
}

const DATA_FILE = join(process.cwd(), 'data', 'coupons.json');

export class CouponService {
  private static instance: CouponService;
  private coupons: Map<string, Coupon> = new Map();

  private constructor() {
    this.load();
  }

  static getInstance(): CouponService {
    if (!CouponService.instance) CouponService.instance = new CouponService();
    return CouponService.instance;
  }

  /** Load coupons from disk */
  private load(): void {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = readFileSync(DATA_FILE, 'utf-8');
        const arr: Coupon[] = JSON.parse(raw);
        for (const c of arr) this.coupons.set(c.code, c);
        logger.info(`[Coupon] Loaded ${arr.length} coupons from disk`);
      }
    } catch (err) {
      logger.error('[Coupon] Failed to load coupons file', err);
    }
  }

  /** Save coupons to disk */
  private save(): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(DATA_FILE, JSON.stringify(this.listCoupons(), null, 2));
    } catch (err) {
      logger.error('[Coupon] Failed to save coupons file', err);
    }
  }

  /** Admin: create a coupon */
  createCoupon(input: {
    code: string;
    discountPercent: number;
    maxUses?: number;
    validUntil?: string;
    applicableTiers?: string[];
    active?: boolean;
  }): Coupon {
    const code = input.code.toUpperCase().trim();
    if (this.coupons.has(code)) throw new Error(`Coupon ${code} already exists`);
    if (input.discountPercent < 1 || input.discountPercent > 100) {
      throw new Error('Discount must be 1-100%');
    }

    const coupon: Coupon = {
      code,
      discountPercent: input.discountPercent,
      maxUses: input.maxUses ?? 0,
      currentUses: 0,
      validUntil: input.validUntil ?? null,
      applicableTiers: input.applicableTiers ?? [],
      createdAt: new Date().toISOString(),
      active: input.active ?? true,
    };

    this.coupons.set(code, coupon);
    this.save();
    logger.info(`[Coupon] Created: ${code} (${input.discountPercent}% off)`);
    return coupon;
  }

  /** Validate and apply coupon, returns discounted price */
  applyCoupon(code: string, tier: string, originalPrice: number): {
    valid: boolean;
    discountedPrice: number;
    discountPercent: number;
    error?: string;
  } {
    const coupon = this.coupons.get(code.toUpperCase().trim());

    if (!coupon || !coupon.active) {
      return { valid: false, discountedPrice: originalPrice, discountPercent: 0, error: 'Invalid coupon code' };
    }

    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      return { valid: false, discountedPrice: originalPrice, discountPercent: 0, error: 'Coupon expired' };
    }

    if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
      return { valid: false, discountedPrice: originalPrice, discountPercent: 0, error: 'Coupon usage limit reached' };
    }

    if (coupon.applicableTiers.length > 0 && !coupon.applicableTiers.includes(tier.toUpperCase())) {
      return { valid: false, discountedPrice: originalPrice, discountPercent: 0, error: `Coupon not valid for ${tier}` };
    }

    const discountedPrice = Math.max(0, originalPrice * (1 - coupon.discountPercent / 100));

    return { valid: true, discountedPrice: Math.round(discountedPrice * 100) / 100, discountPercent: coupon.discountPercent };
  }

  /** Record a coupon use after payment is confirmed */
  recordUse(code: string): void {
    const coupon = this.coupons.get(code.toUpperCase().trim());
    if (coupon) {
      coupon.currentUses++;
      this.save();
      logger.info(`[Coupon] Use recorded: ${coupon.code} (${coupon.currentUses}/${coupon.maxUses || '∞'})`);
    }
  }

  /** Admin: list all coupons */
  listCoupons(): Coupon[] {
    return Array.from(this.coupons.values());
  }

  /** Admin: deactivate coupon */
  deactivateCoupon(code: string): boolean {
    const coupon = this.coupons.get(code.toUpperCase().trim());
    if (!coupon) return false;
    coupon.active = false;
    this.save();
    return true;
  }
}
