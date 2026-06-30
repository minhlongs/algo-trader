// ── CashClaw Checkout Service (forest service) ──
// NOWPayments URL routing — pure business logic, no DOM

import { CHECKOUT } from '../config.js';

/**
 * Get the checkout URL for a given tier and optional coupon.
 * Returns null for free-access coupons (triggers activation modal instead).
 * Returns the discounted URL if the coupon provides one.
 */
export function getCheckoutUrl(tier, coupon) {
  if (!coupon) {
    return CHECKOUT[tier].url;
  }
  if (coupon.freeAccess) {
    return null; // caller should show activation modal
  }
  if (coupon.urls && coupon.urls[tier]) {
    return coupon.urls[tier];
  }
  return CHECKOUT[tier].url;
}

/**
 * Get the original price for a tier.
 */
export function getOriginalPrice(tier) {
  return CHECKOUT[tier].price;
}
