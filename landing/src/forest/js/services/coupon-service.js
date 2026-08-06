// ── CashClaw Coupon Service (forest service) ──
// Pure business logic — no DOM manipulation

import { API_BASE, TIER_PRICES } from '../config.js';
import { postJSON } from '../utils/api.js';

/**
 * Validate a coupon code against the server.
 * Returns { ok, data: { valid, discountPercent, urls, freeAccess, reason } }
 */
export async function validateCoupon(code) {
  return postJSON(`${API_BASE}/coupons/validate`, {
    code: code.toUpperCase().trim(),
    project: 'cashclaw'
  });
}

/**
 * Calculate discounted prices for all tiers given a coupon.
 * Returns an object mapping tier → { finalPrice, isFree, originalPrice }.
 */
export function calculatePrices(coupon) {
  const discount = coupon.discountPercent || 0;
  const result = {};
  for (const [tier, original] of Object.entries(TIER_PRICES)) {
    if (coupon.freeAccess) {
      result[tier] = { finalPrice: 0, isFree: true, originalPrice: original };
    } else {
      result[tier] = {
        finalPrice: Math.round(original * (1 - discount / 100) * 100) / 100,
        isFree: false,
        originalPrice: original
      };
    }
  }
  return result;
}

/**
 * Activate a coupon for a registered user.
 * Fire-and-forget — logs errors but doesn't block the user flow.
 */
export async function activateCoupon(email, tier, couponCode) {
 try {
  await fetch('https://api.cashclaw.cc/api/coupons/activate', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ email, tier, couponCode, project: 'cashclaw' })
  });
 } catch {
  // Silently ignore — checkout already succeeded
 }
}

/**
 * Redeem a coupon before checkout — validates + records usage + returns checkout URL.
 * Returns { ok, data } where data has checkoutUrl on success or error on failure.
 */
export async function redeemCoupon(tier, couponCode) {
  try {
    const res = await postJSON(`${API_BASE}/coupons/redeem`, {
      code: couponCode.toUpperCase().trim(),
      tier,
      project: 'cashclaw'
    });
    return res;
  } catch (err) {
    return { ok: false, error: err.message || 'Redemption failed' };
  }
}
