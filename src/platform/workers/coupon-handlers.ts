/**
 * CashClaw coupon handler — CF-native, zero VPS.
 * Coupons stored in KV (`coupon:CODE` keys).
 * Matches landing page forest/js/services/coupon-service.js contract.
 * Uses SDK-style validation + structured errors from nowpayments-utils.
 *
 * Facade: re-exports handlers from leaf modules. Seed coupon logic kept here.
 */

import type { Coupon, Env } from './coupon-helpers';
import { handleValidateCoupon } from './coupon-validate';
import { handleRedeemCoupon } from './coupon-redeem';
import { handleApplyCoupon, handleActivateCoupon } from './coupon-apply';

export { handleValidateCoupon, handleApplyCoupon, handleRedeemCoupon, handleActivateCoupon };
export type { Env };

/** Seed default coupons into KV if not present */
export async function seedCoupons(env: Env): Promise<void> {
  const existing = await env.CACHE.get('coupon:LAUNCH20');
  if (existing) return;
  const launchCoupon: Coupon = {
    code: 'LAUNCH20',
    discountPercent: 20,
    maxUses: 100,
    currentUses: 0,
    validUntil: '2026-07-30T00:00:00.000Z',
    applicableTiers: ['STARTER', 'PRO', 'ELITE'],
    createdAt: new Date().toISOString(),
    active: true,
  };
  await env.CACHE.put('coupon:LAUNCH20', JSON.stringify(launchCoupon));
}