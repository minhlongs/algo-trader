/**
 * CashClaw coupon handler — CF-native, zero VPS.
 * Coupons stored in KV (`coupon:CODE` keys).
 * Matches landing page forest/js/services/coupon-service.js contract.
 * Uses SDK-style validation + structured errors from nowpayments-utils.
 */

import { isNonEmptyString, validationError, apiError } from './nowpayments-utils';

interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_API_KEY?: string;
}

interface Coupon {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  validUntil: string | null;
  applicableTiers: string[];
  createdAt: string;
  active: boolean;
}

interface ValidateResponse {
  valid: boolean;
  discountPercent?: number;
  urls?: Record<string, string>;
  freeAccess?: boolean;
  reason?: string;
}

interface ActivateBody {
  email?: string;
  tier?: string;
  couponCode?: string;
  project?: string;
}

const TIER_PRICES: Record<string, number> = { PRO: 99, ENTERPRISE: 299, MASTER: 999 };
const _INVOICE_IDS: Record<string, string> = { PRO: '5493882802', ENTERPRISE: '5264305182', MASTER: '4296538179' };
const SUCCESS_URL = 'https://cashclaw.cc/dashboard.html';
const CANCEL_URL = 'https://cashclaw.cc/#pricing';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function loadCoupon(env: Env, code: string): Promise<Coupon | null> {
  const raw = await env.CACHE.get(`coupon:${code.toUpperCase().trim()}`);
  return raw ? (JSON.parse(raw) as Coupon) : null;
}

function validateCoupon(coupon: Coupon): string | null {
  if (!coupon.active) return 'Coupon is no longer active';
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return 'Coupon expired';
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) return 'Coupon usage limit reached';
  return null;
}

async function createInvoice(npApiKey: string, orderId: string, description: string, price: number): Promise<string | null> {
  try {
    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: { 'x-api-key': npApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: price,
        price_currency: 'usd',
        order_id: orderId,
        order_description: description,
        ipn_callback_url: 'https://api.cashclaw.cc/api/webhooks/nowpayments',
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
      }),
    });
    const invoice = await res.json() as { id?: string; invoice_url?: string };
    return invoice.invoice_url || (invoice.id ? `https://nowpayments.io/payment?iid=${invoice.id}` : null);
  } catch {
    return null;
  }
}

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
    applicableTiers: ['PRO', 'ENTERPRISE', 'MASTER'],
    createdAt: new Date().toISOString(),
    active: true,
  };
  await env.CACHE.put('coupon:LAUNCH20', JSON.stringify(launchCoupon));
}

/** GET /api/coupons — list active coupons */
export async function handleListCoupons(env: Env): Promise<Response> {
  const list = await env.CACHE.list({ prefix: 'coupon:' });
  const coupons: Coupon[] = [];
  for (const key of list.keys) {
    const raw = await env.CACHE.get(key.name);
    if (raw) coupons.push(JSON.parse(raw) as Coupon);
  }
  return json({ coupons });
}

/**
 * POST /api/coupons/validate — matches landing page coupon-service.js contract.
 * Input:  { code, project }
 * Output: { valid, discountPercent?, urls?, freeAccess?, reason? }
 *
 * Creates discounted NOWPayments invoices if API key is available.
 * Falls back to discountPercent-only if no key (frontend uses hardcoded invoice links).
 */
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
    return json({ valid: false, reason: 'Validation failed', ...validationError((err as Error).message) } as ValidateResponse, 500);
  }
}

/**
 * POST /api/coupons/activate — fire-and-forget after successful checkout.
 * Called by landing page coupon-service.js activateCoupon().
 * Input: { email, tier, couponCode, project }
 */
export async function handleActivateCoupon(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ActivateBody;
    const code = (body.couponCode || '').toUpperCase().trim();
    if (!code) return json({ ok: true }); // no-op

    const coupon = await loadCoupon(env, code);
    if (!coupon) return json({ ok: true }); // silent no-op

    coupon.currentUses++;
    await env.CACHE.put(`coupon:${coupon.code}`, JSON.stringify(coupon));

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

/**
 * POST /api/coupons/apply — dashboard backward compatibility.
 * Same as validate but returns a single checkout URL for the specified tier.
 * Input: { code, tier, project? }
 * Output: { success, discountPercent, originalPrice, finalPrice, checkoutUrl?, message? }
 */
export async function handleApplyCoupon(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { code?: string; tier?: string; project?: string };
    const { code, tier, project = 'cashclaw' } = body;
    if (!isNonEmptyString(code) || !isNonEmptyString(tier)) return json(validationError('code and tier required', 'MISSING_FIELDS'), 400);

    const tierKey = tier!.toUpperCase();
    const originalPrice = TIER_PRICES[tierKey];
    if (!originalPrice) return json(validationError(`Invalid tier: ${tierKey}`, 'INVALID_TIER'), 400);

    const coupon = await loadCoupon(env, code!);
    if (!coupon) return json(validationError('Invalid coupon code', 'INVALID_COUPON'), 400);

    const validationErr = validateCoupon(coupon);
    if (validationErr) return json(validationError(validationErr, 'COUPON_INVALID'), 400);

    if (coupon.applicableTiers.length > 0 && !coupon.applicableTiers.includes(tierKey)) {
      return json(validationError(`Coupon not valid for ${tierKey} tier`, 'COUPON_TIER_MISMATCH'), 400);
    }

    const discountPercent = coupon.discountPercent;
    const finalPrice = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;

    if (finalPrice === 0) {
      coupon.currentUses++;
      await env.CACHE.put(`coupon:${coupon.code}`, JSON.stringify(coupon));
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

    coupon.currentUses++;
    await env.CACHE.put(`coupon:${coupon.code}`, JSON.stringify(coupon));

    return json({ success: true, discountPercent, originalPrice, finalPrice, checkoutUrl });
  } catch (err) {
    return json(apiError((err as Error).message || 'Coupon processing failed'), 500);
  }
}
