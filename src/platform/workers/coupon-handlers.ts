/**
 * CashClaw coupon handler — CF-native, zero VPS.
 * Coupons stored in KV (`coupon:CODE` keys).
 * Matches landing page forest/js/services/coupon-service.js contract.
 * Uses SDK-style validation + structured errors from nowpayments-utils.
 */

import { assertString, isNonEmptyString, validationError, configError, apiError } from './nowpayments-utils';
import type { KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_API_KEY?: string | null;
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

const TIER_PRICES: Record<string, number> = { STARTER: 49, PRO: 149, ELITE: 499 };
const INVOICE_IDS: Record<string, string> = { STARTER: '4725459350', PRO: '5493882802', ELITE: '5264305822' };
const SUCCESS_URL = 'https://cashclaw.cc/dashboard.html';
const CANCEL_URL = 'https://cashclaw.cc/#pricing';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

const CODE_RE = /^[A-Z0-9_-]{1,32}$/;

function sanitizeCode(input: string): string {
  return input.toUpperCase().trim();
}

interface LockResult<T> {
  ok: true;
  value: T;
}

type LockOperation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

async function loadCoupon(env: Env, code: string): Promise<Coupon | null> {
  const key = `coupon:${sanitizeCode(code)}`;
  const raw = await env.CACHE.get(key);
  return raw ? (JSON.parse(raw) as Coupon) : null;
}

async function withRedeemLock(
  env: Env,
  code: string,
  fn: (coupon: Coupon) => Promise<LockOperation<Coupon>>,
): Promise<LockOperation<Coupon>> {
  const lockKey = `lock:coupon:${code}`;
  const gotLock = await env.CACHE.put(lockKey, '1', { expirationTtl: 60 });
  let acquired = gotLock === undefined;
  if (!acquired) {
    await new Promise((r) => setTimeout(r, 50));
    acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: 60 })) === undefined;
  }
  try {
    const coupon = await loadCoupon(env, code);
    if (!coupon) return { ok: false, error: 'not_found', status: 404 };
    return await fn(coupon);
  } finally {
    await env.CACHE.delete(lockKey).catch(() => {});
  }
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'content-type': 'application/json', ...CORS_HEADERS } });
}

function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}


async function withCouponLock<T>(
  env: Env,
  code: string,
  fn: (coupon: Coupon) => Promise<T>,
): Promise<T> {
  const lockKey = `lock:coupon:${code}`;
  const gotLock = await env.CACHE.put(lockKey, '1', { expirationTtl: 60 });
  let acquired = gotLock === undefined;
  if (!acquired) {
    await new Promise(r => setTimeout(r, 100));
    acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: 60 })) === undefined;
  }
  try {
    const coupon = await loadCoupon(env, code);
    if (!coupon) throw new Error('not_found');
    return await fn(coupon);
  } finally {
    await env.CACHE.delete(lockKey).catch(() => {});
  }
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
    applicableTiers: ['STARTER', 'PRO', 'ELITE'],
    createdAt: new Date().toISOString(),
    active: true,
  };
  await env.CACHE.put('coupon:LAUNCH20', JSON.stringify(launchCoupon));
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
    return json({ valid: false, reason: 'Validation failed' } as ValidateResponse, 500);
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

/**
 * POST /api/coupons/redeem — atomic redeem + checkout URL generation.
 * Input: { code, tier }
 * Output: { ok, coupon? { code, discountPct }, finalPrice, originalPrice, discountPercent, checkoutUrl? }
 */
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
