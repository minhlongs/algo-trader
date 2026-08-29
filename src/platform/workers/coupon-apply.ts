/**
 * POST /api/coupons/activate — fire-and-forget after successful checkout.
 * Called by landing page coupon-service.js activateCoupon().
 * Input: { email, tier, couponCode, project }
 *
 * POST /api/coupons/apply — dashboard backward compatibility.
 * Same as validate but returns a single checkout URL for the specified tier.
 * Input: { code, tier, project? }
 * Output: { success, discountPercent, originalPrice, finalPrice, checkoutUrl?, message? }
 */

import type { ActivateBody, Coupon, Env } from './coupon-helpers';
import { isNonEmptyString, validationError, apiError, json, CODE_RE, sanitizeCode, loadCoupon, validateCoupon, TIER_PRICES, createInvoice, withCouponLock } from './coupon-helpers';

export async function handleActivateCoupon(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ActivateBody;
    const code = (body.couponCode || '').toUpperCase().trim();
    if (!code) return json({ ok: true }); // no-op

    let coupon = await loadCoupon(env, code);
    if (!coupon) return json({ ok: true }); // silent no-op

    const couponCode_ap = coupon.code;
    coupon = await withCouponLock(env, code, async (c) => {
      c.currentUses++;
      await env.CACHE.put(`coupon:${c.code}`, JSON.stringify(c));
      return c;
    }) as Coupon;
    coupon.code = couponCode_ap;

    // Log activation for audit
    const logEntry = {
      email: body.email || 'unknown',
      tier: body.tier || 'unknown',
      code: coupon.code,
      project: body.project || 'cashclaw',
      timestamp: new Date().toISOString(),
    };
    await env.CACHE.put(`activation:${Date.now()}`, JSON.stringify(logEntry));

    return json({ ok: true });
  } catch {
    return json({ ok: true }); // never block user flow
  }
}

export async function handleApplyCoupon(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { code?: string; tier?: string; project?: string };
    const { code, tier, project = 'cashclaw' } = body;
    if (!isNonEmptyString(code) || !CODE_RE.test(sanitizeCode(code!)) || !isNonEmptyString(tier)) return json(validationError('code and tier required', 'MISSING_FIELDS'), 400);

    const tierKey = tier!.toUpperCase();
    const originalPrice = TIER_PRICES[tierKey];
    if (!originalPrice) return json(validationError(`Invalid tier: ${tierKey}`, 'INVALID_TIER'), 400);

    let coupon = await loadCoupon(env, code!);
    if (!coupon) return json(validationError('Invalid coupon code', 'INVALID_COUPON'), 400);

    const validationErr = validateCoupon(coupon);
    if (validationErr) return json(validationError(validationErr, 'COUPON_INVALID'), 400);

    if (coupon.applicableTiers.length > 0 && !coupon.applicableTiers.includes(tierKey)) {
      return json(validationError(`Coupon not valid for ${tierKey} tier`, 'COUPON_TIER_MISMATCH'), 400);
    }

    const discountPercent = coupon.discountPercent;
    const finalPrice = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;

    // Increment usage exactly once under a single lock acquisition
    const savedCode = coupon.code;
    coupon = await withCouponLock(env, code, async (c) => {
      c.currentUses++;
      await env.CACHE.put(`coupon:${c.code}`, JSON.stringify(c));
      return c;
    }) as Coupon;
    coupon.code = savedCode;

    if (finalPrice === 0) {
      return json({
        success: true, discountPercent, originalPrice, finalPrice: 0,
        message: 'Free access granted', checkoutUrl: null,
      });
    }

    let checkoutUrl: string | null = null;
    if (env.NOWPAYMENTS_API_KEY) {
      const orderId = `${project}_${tierKey}_${code}_${Date.now()}`;
      checkoutUrl = await createInvoice(env.NOWPAYMENTS_API_KEY, orderId, `${project} ${tierKey} (${discountPercent}% off)`, finalPrice);
    }

    return json({ success: true, discountPercent, originalPrice, finalPrice, checkoutUrl });
  } catch (err) {
    return json(apiError('Coupon processing failed'), 500);
  }
}