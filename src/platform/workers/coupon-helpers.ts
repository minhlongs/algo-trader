/**
 * CashClaw coupon handler — CF-native, zero VPS.
 * Coupons stored in KV (`coupon:CODE` keys).
 * Matches landing page forest/js/services/coupon-service.js contract.
 * Uses SDK-style validation + structured errors from nowpayments-utils.
 * Shared infrastructure for coupon handlers.
 */

export { isNonEmptyString, validationError, configError, apiError } from './nowpayments-utils';
import type { KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_API_KEY?: string | null;
}

export interface Coupon {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  validUntil: string | null;
  applicableTiers: string[];
  createdAt: string;
  active: boolean;
}

export interface ValidateResponse {
  valid: boolean;
  discountPercent?: number;
  urls?: Record<string, string>;
  freeAccess?: boolean;
  reason?: string;
}

export interface ActivateBody {
  email?: string;
  tier?: string;
  couponCode?: string;
  project?: string;
}

export const TIER_PRICES: Record<string, number> = { STARTER: 49, PRO: 149, ELITE: 499 };
const INVOICE_IDS: Record<string, string> = { STARTER: '4725459350', PRO: '5493882802', ELITE: '5264305822' };
const SUCCESS_URL = 'https://cashclaw.cc/dashboard.html';
const CANCEL_URL = 'https://cashclaw.cc/#pricing';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

export const CODE_RE = /^[A-Z0-9_-]{1,32}$/;

export function sanitizeCode(input: string): string {
  return input.toUpperCase().trim();
}

export interface LockResult<T> {
  ok: true;
  value: T;
}

export type LockOperation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

export async function loadCoupon(env: Env, code: string): Promise<Coupon | null> {
  const key = `coupon:${sanitizeCode(code)}`;
  const raw = await env.CACHE.get(key);
  return raw ? (JSON.parse(raw) as Coupon) : null;
}

export async function withRedeemLock(
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

export function methodNotAllowed(): Response {
  return json({ error: 'Method Not Allowed' }, 405);
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function withCouponLock<T>(
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

export function validateCoupon(coupon: Coupon): string | null {
  if (!coupon.active) return 'Coupon is no longer active';
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return 'Coupon expired';
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) return 'Coupon usage limit reached';
  return null;
}

export async function createInvoice(npApiKey: string, orderId: string, description: string, price: number): Promise<string | null> {
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