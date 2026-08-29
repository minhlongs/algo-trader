/**
 * POST /api/coupons/validate — matches landing page coupon-service.js contract.
 * Input:  { code, project }
 * Output: { valid, discountPercent?, urls?, freeAccess?, reason? }
 *
 * Creates discounted NOWPayments invoices if API key is available.
 * Falls back to discountPercent-only if no key (frontend uses hardcoded invoice links).
 */

import type { Env, ValidateResponse } from './coupon-helpers';
import { isNonEmptyString, json, loadCoupon, validateCoupon, TIER_PRICES, createInvoice } from './coupon-helpers';

export async function handleValidateCoupon(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { code?: string; project?: string };
    const { code } = body;
    if (!isNonEmptyString(code)) return json({ valid: false, reason: 'Enter a code' } as ValidateResponse, 400);

    const coupon = await loadCoupon(env, code);
    if (!coupon) return json({ valid: false, reason: 'Invalid coupon code' } as ValidateResponse);

    const validationErr = validateCoupon(coupon);
    if (validationErr) return json({ valid: false, reason: validationErr } as ValidateResponse);

    const discountPercent = coupon.discountPercent;
    const freeAccess = discountPercent >= 100;

    const response: ValidateResponse = { valid: true, discountPercent, freeAccess };

    // Create discounted checkout URLs per tier (requires API key)
    if (env.NOWPAYMENTS_API_KEY && !freeAccess) {
      const urls: Record<string, string> = {};
      for (const tier of coupon.applicableTiers) {
        const originalPrice = TIER_PRICES[tier];
        if (!originalPrice) continue;
        const discounted = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;
        const orderId = `cashclaw_${tier}_${coupon.code}_${Date.now()}`;
        const url = await createInvoice(env.NOWPAYMENTS_API_KEY, orderId, `CashClaw ${tier} (${discountPercent}% off with ${coupon.code})`, discounted);
        if (url) urls[tier] = url;
      }
      if (Object.keys(urls).length > 0) response.urls = urls;
    }

    return json(response);
  } catch (err) {
    return json({ valid: false, reason: 'Validation failed' } as ValidateResponse, 500);
  }
}