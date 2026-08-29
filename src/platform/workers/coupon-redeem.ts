/**
 * POST /api/coupons/redeem — atomic redeem + checkout URL generation.
 * Input: { code, tier }
 * Output: { ok, coupon? { code, discountPct }, finalPrice, originalPrice, discountPercent, checkoutUrl? }
 */

import type { Coupon, Env } from './coupon-helpers';
import { isNonEmptyString, json, TIER_PRICES, validateCoupon, withCouponLock, createInvoice } from './coupon-helpers';

export async function handleRedeemCoupon(request: Request, env: Env): Promise<Response> {
 try {
 const body = await request.json() as { code?: string; tier?: string };
 const { code, tier } = body;
 if (!isNonEmptyString(code)) return json({ ok: false, error: 'Missing code' }, 400);
 if (!isNonEmptyString(tier)) return json({ ok: false, error: 'Missing tier' }, 400);

 const tierKey = tier.toUpperCase();
 const originalPrice = TIER_PRICES[tierKey];
 if (!originalPrice) return json({ ok: false, error: `Invalid tier: ${tierKey}` }, 400);

 let coupon: Coupon | null = null;
 const result = await withCouponLock(env, code.toUpperCase().trim(), async (c) => {
 // Validate the coupon that was loaded by the lock
 const err = validateCoupon(c);
 if (err) return { error: err, status: 400 as const };
 if (c.applicableTiers.length > 0 && !c.applicableTiers.includes(tierKey)) {
 return { error: `Coupon not valid for ${tierKey} tier`, status: 400 as const };
 }
 c.currentUses++;
 await env.CACHE.put(`coupon:${c.code}`, JSON.stringify(c));
 return { coupon: c };
 }).catch((e: Error) => {
 if (e.message === 'not_found') return { error: 'Coupon not found', status: 404 as const };
 return { error: e.message, status: 400 as const };
 });

 coupon = (result as any).coupon ?? null;
 if ((result as any).error) return json({ ok: false, error: (result as any).error }, (result as any).status ?? 400);
 if (!coupon) return json({ ok: false, error: 'Coupon not found' }, 404);

 const discountPercent = coupon.discountPercent;
 const finalPrice = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;
 const freeAccess = discountPercent >= 100;

 let checkoutUrl: string | null = null;
 if (!freeAccess && env.NOWPAYMENTS_API_KEY) {
 const orderId = `cashclaw_${tierKey}_${coupon.code}_${Date.now()}`;
 checkoutUrl = await createInvoice(
 env.NOWPAYMENTS_API_KEY,
 orderId,
 `CashClaw ${tierKey} (${discountPercent}% off with ${coupon.code})`,
 finalPrice
 );
 }

 return json({
 ok: true,
 coupon: { code: coupon.code, discountPct: coupon.discountPercent },
 originalPrice,
 discountPercent,
 finalPrice,
 checkoutUrl,
 });
 } catch (err) {
 return json({ ok: false, error: 'Redemption failed' }, 500);
 }
}