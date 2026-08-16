/**
 * Coupon service — validate, apply, expire.
 *
 * Endpoints:
 * POST /api/coupons/validate — check coupon + compute discounted price
 * POST /api/coupons/apply — apply coupon to subscription (atomic)
 *
 * Coupon schema (D1):
 * code TEXT PK, discount_pct INTEGER, tier_lock TEXT, free_access INTEGER, expires_at TEXT, usage_count INTEGER
 */

import { logger } from '../../../shared/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface Env {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
}

export async function handleValidateCoupon(request: Request, env: Env): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  let code: string = '';
  try {
    const parsed = (await request.json()) as { code: string; tier: string };
    code = parsed.code;
    const { tier } = parsed;
    if (!code) return badRequest('code is required');

    if (!sub) {
      // Fallback: check KV cache if D1 not yet available
      const cached = await env.CACHE.get(`coupon:${code.toUpperCase()}`);
      if (!cached) return notFound('Coupon not found');
      const coupon = JSON.parse(cached);
      return new Response(JSON.stringify({ valid: !!coupon, coupon }), { headers: jsonH(env, request) });
    }

    const coupon = await sub.prepare(
      'SELECT code, discount_pct, tier_lock, free_access, expires_at, usage_count FROM coupons WHERE code = ?'
    ).bind(code.toUpperCase()).first<{ code: string; discount_pct: number; tier_lock: string; free_access: number; expires_at: string; usage_count: number }>();

    if (!coupon) return notFound('Coupon not found');

    const now = new Date();
    const expires = new Date(coupon.expires_at);
    if (coupon.expires_at && now > expires) {
      return new Response(JSON.stringify({ valid: false, reason: 'Coupon expired' }), { headers: jsonH(env, request) });
    }

    const tierMatch = !coupon.tier_lock || coupon.tier_lock.toUpperCase() === tier.toUpperCase();
    if (!tierMatch) {
      return new Response(JSON.stringify({ valid: false, reason: `Coupon only valid for ${coupon.tier_lock} tier` }), { headers: jsonH(env, request) });
    }

    return new Response(JSON.stringify({
      valid: true,
      coupon: {
        code: coupon.code,
        discountPct: coupon.discount_pct,
        freeAccess: !!coupon.free_access,
        tierLock: coupon.tier_lock,
      },
    }), { headers: jsonH(env, request) });
  } catch (err) {
    logger.error('[coupons] validate error', { error: String(err) });
    // Fallback to KV on D1 failure
    const cached = await env.CACHE.get(`coupon:${code.toUpperCase()}`);
    if (cached) {
      const coupon = JSON.parse(cached);
      return new Response(JSON.stringify({ valid: !!coupon, coupon }), { headers: jsonH(env, request) });
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleApplyCoupon(request: Request, env: Env): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  let code = '';
  try {
    const parsed = (await request.json()) as { code: string; userId: string };
    code = parsed.code;
    const { userId } = parsed;
    if (!code || !userId) return badRequest('code and userId are required');

    if (!sub) {
      // D1 missing — fall back to KV
      const cached2 = await env.CACHE.get(`coupon:${code.toUpperCase()}`);
      if (!cached2) return notFound('Coupon not found');
      const c: Record<string, unknown> = JSON.parse(cached2);
      const n = Number((c as Record<string, unknown>).currentUses ?? (c as Record<string, unknown>).usage_count ?? 0) + 1;
      const updated = { ...c, currentUses: n };
      await env.CACHE.put(`coupon:${code.toUpperCase()}`, JSON.stringify(updated));
      logger.info('[coupons] applied via KV', { userId, code: c.code as string });
      return new Response(JSON.stringify({ applied: true, coupon: { code: c.code as string, discountPct: (c.discount_pct as number) ?? 0, freeAccess: !!(c.free_access as number) } }), { headers: jsonH(env, request) });
    }

    // Atomically verify + increment in one transaction
    const result = await sub.prepare(
      `UPDATE coupons SET usage_count = usage_count + 1 WHERE code = ? RETURNING code, discount_pct, tier_lock, free_access, expires_at`
    ).bind(code.toUpperCase()).first<{ code: string; discount_pct: number; tier_lock: string; free_access: number }>();

    if (!result) return new Response(JSON.stringify({ error: 'Invalid or expired coupon' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    logger.info('[coupons] applied', { userId, code: result.code });
    return new Response(JSON.stringify({
      applied: true,
      coupon: { code: result.code, discountPct: result.discount_pct, freeAccess: !!result.free_access },
    }), { headers: jsonH(env, request) });
  } catch (err) {
    logger.error('[coupons] apply error', { error: String(err) });
    // Fallback to KV on D1 failure
    const cached2 = await env.CACHE.get(`coupon:${code.toUpperCase()}`);
    if (cached2) {
      const c: Record<string, unknown> = JSON.parse(cached2);
      const n = Number((c as Record<string, unknown>).currentUses ?? (c as Record<string, unknown>).usage_count ?? 0) + 1;
      await env.CACHE.put(`coupon:${code.toUpperCase()}`, JSON.stringify({ ...c, currentUses: n }));
      return new Response(JSON.stringify({ applied: true, coupon: { code: c.code as string, discountPct: (c.discount_pct as number) ?? 0, freeAccess: !!(c.free_access as number) } }), { headers: jsonH(env, request) });
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}
function notFound(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
function jsonH(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': o };
}
