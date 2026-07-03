/**
 * Coupon Service
 * Manages discount codes — persisted to PostgreSQL so coupons survive restarts.
 */

import { query } from '../../shared/db/postgres-client';
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

interface CouponRow {
  code: string;
  discount_percent: number;
  max_uses: number;
  current_uses: number;
  valid_until: Date | null;
  applicable_tiers: string[];
  created_at: Date;
  active: boolean;
}

function rowToCoupon(row: CouponRow): Coupon {
  return {
    code: row.code,
    discountPercent: row.discount_percent,
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    validUntil: row.valid_until ? row.valid_until.toISOString() : null,
    applicableTiers: row.applicable_tiers ?? [],
    createdAt: row.created_at.toISOString(),
    active: row.active,
  };
}

export class CouponService {
  private static instance: CouponService;

  private constructor() {}

  static getInstance(): CouponService {
    if (!CouponService.instance) CouponService.instance = new CouponService();
    return CouponService.instance;
  }

  /** Admin: create a coupon */
  async createCoupon(input: {
    code: string;
    discountPercent: number;
    maxUses?: number;
    validUntil?: string;
    applicableTiers?: string[];
  }): Promise<Coupon> {
    const code = input.code.toUpperCase().trim();
    if (input.discountPercent < 1 || input.discountPercent > 100) {
      throw new Error('Discount must be 1-100%');
    }

    // Check if already exists
    const existing = await query('SELECT code FROM coupons WHERE code = $1', [code]);
    if (existing.rows.length > 0) throw new Error(`Coupon ${code} already exists`);

    const result = await query(
      `INSERT INTO coupons (code, discount_percent, max_uses, current_uses, valid_until, applicable_tiers, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        code,
        input.discountPercent,
        input.maxUses ?? 0,
        0,
        input.validUntil ?? null,
        input.applicableTiers ?? [],
      ]
    );

    const coupon = rowToCoupon(result.rows[0] as unknown as CouponRow);
    logger.info(`[Coupon] Created: ${code} (${input.discountPercent}% off)`);
    return coupon;
  }

  /** Validate and apply coupon, returns discounted price */
  async applyCoupon(code: string, tier: string, originalPrice: number): Promise<{
    valid: boolean;
    discountedPrice: number;
    discountPercent: number;
    error?: string;
  }> {
    const result = await query(
      'SELECT * FROM coupons WHERE code = $1',
      [code.toUpperCase().trim()]
    );

    if (result.rows.length === 0) {
      return { valid: false, discountedPrice: originalPrice, discountPercent: 0, error: 'Invalid coupon code' };
    }

    const coupon = rowToCoupon(result.rows[0] as unknown as CouponRow);

    if (!coupon.active) {
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
  async recordUse(code: string): Promise<void> {
    const result = await query(
      `UPDATE coupons SET current_uses = current_uses + 1 WHERE code = $1 RETURNING *`,
      [code.toUpperCase().trim()]
    );

    if (result.rows.length > 0) {
      const coupon = rowToCoupon(result.rows[0] as unknown as CouponRow);
      logger.info(`[Coupon] Use recorded: ${coupon.code} (${coupon.currentUses}/${coupon.maxUses || '∞'})`);
    }
  }

  /** Admin: list all coupons */
  async listCoupons(): Promise<Coupon[]> {
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    return result.rows.map((r) => rowToCoupon(r as unknown as CouponRow));
  }

  /** Admin: deactivate coupon */
  async deactivateCoupon(code: string): Promise<boolean> {
    const result = await query(
      'UPDATE coupons SET active = false WHERE code = $1 RETURNING code',
      [code.toUpperCase().trim()]
    );
    return result.rows.length > 0;
  }
}
