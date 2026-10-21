/**
 * Coupon Lifecycle Rules
 *
 * Pure redemption-eligibility rules for a loaded coupon. Kept separate from KV
 * access and payment so the policy is testable without a KV binding.
 */

import type { Coupon } from './coupon-model';

/**
 * Return a human-readable rejection reason, or null when the coupon may be
 * redeemed.
 */
export function validateCoupon(coupon: Coupon): string | null {
  if (!coupon.active) return 'Coupon is no longer active';
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return 'Coupon expired';
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) return 'Coupon usage limit reached';
  return null;
}
