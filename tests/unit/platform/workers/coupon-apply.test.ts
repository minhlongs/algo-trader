/**
 * Tests for coupon-apply — handleActivateCoupon + handleApplyCoupon.
 *
 * handleActivateCoupon is fire-and-forget (never throws); handleApplyCoupon
 * validates and returns discount/checkout data. Uses an in-memory KV mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleActivateCoupon, handleApplyCoupon } from '../../../../src/platform/workers/coupon-apply';
import type { Coupon } from '../../../../src/platform/workers/coupon-helpers';

function makeEnv(kv: any, opts: { nowApiKey?: string | null } = {}) {
  return {
    CACHE: kv,
    NOWPAYMENTS_API_KEY: opts.nowApiKey ?? null,
  } as any;
}

function jsonResponse(res: Response) {
  return res.json();
}

const COUPON: Coupon = {
  code: 'WELCOME',
  discountPercent: 10,
  maxUses: 100,
  currentUses: 0,
  validUntil: null,
  applicableTiers: [],
  createdAt: new Date().toISOString(),
  active: true,
};

describe('handleActivateCoupon', () => {
  let kv: any;
  beforeEach(() => {
    kv = {
      _store: new Map<string, string>(),
      get: async (k: string) => kv._store.get(k) ?? null,
      put: async (k: string, v: string) => kv._store.set(k, v),
      delete: async (k: string) => void kv._store.delete(k),
    };
  });

  it('returns ok:true no-op when no coupon code', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', tier: 'STARTER' }),
    });
    const res = await handleActivateCoupon(req, makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await jsonResponse(res)).toEqual({ ok: true });
  });

  it('returns ok:true no-op when coupon not found', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ couponCode: 'GHOST', email: 'a@b.com' }),
    });
    const res = await handleActivateCoupon(req, makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await jsonResponse(res)).toEqual({ ok: true });
  });

  it('increments usage and writes activation log when coupon found', async () => {
    await kv.put('coupon:WELCOME', JSON.stringify(COUPON));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        couponCode: 'welcome',
        email: 'user@example.com',
        tier: 'PRO',
        project: 'cashclaw',
      }),
    });

    const res = await handleActivateCoupon(req, makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await jsonResponse(res)).toEqual({ ok: true });

    const updated = JSON.parse(kv._store.get('coupon:WELCOME')!) as Coupon;
    expect(updated.currentUses).toBe(1);

    // activation log entry written
    const activationKeys = [...kv._store.keys()].filter((k: string) =>
      k.startsWith('activation:'),
    );
    expect(activationKeys.length).toBe(1);
    const log = JSON.parse(kv._store.get(activationKeys[0])!);
    expect(log.email).toBe('user@example.com');
    expect(log.tier).toBe('PRO');
    expect(log.code).toBe('WELCOME');
  });

  it('never blocks user flow on error', async () => {
    // Bad JSON body throws → still ok:true
    const req = new Request('http://x', { method: 'POST', body: 'not-json{' });
    const res = await handleActivateCoupon(req, makeEnv(kv));
    expect(res.status).toBe(200);
    expect(await jsonResponse(res)).toEqual({ ok: true });
  });
});

describe('handleApplyCoupon', () => {
  let kv: any;
  beforeEach(() => {
    kv = {
      _store: new Map<string, string>(),
      get: async (k: string) => kv._store.get(k) ?? null,
      put: async (k: string, v: string) => kv._store.set(k, v),
      delete: async (k: string) => void kv._store.delete(k),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'inv_1', invoice_url: 'https://pay.test/inv_1' }), { status: 200 }),
    );
  });

  it('rejects missing code or tier', async () => {
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: '', tier: 'STARTER' }) }),
      makeEnv(kv),
    );
    expect(res.status).toBe(400);
    const data = await jsonResponse(res);
    expect(data.code).toBe('MISSING_FIELDS');
    expect(data.httpStatus).toBe(400);
  });

  it('rejects invalid tier', async () => {
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'WELCOME', tier: 'GOLD' }) }),
      makeEnv(kv),
    );
    expect(res.status).toBe(400);
    const data = await jsonResponse(res);
    expect(data.code).toBe('INVALID_TIER');
    expect(data.httpStatus).toBe(400);
  });

  it('rejects unknown coupon code', async () => {
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'GHOST', tier: 'STARTER' }) }),
      makeEnv(kv),
    );
    expect(res.status).toBe(400);
    const data = await jsonResponse(res);
    expect(data.code).toBe('INVALID_COUPON');
    expect(data.httpStatus).toBe(400);
  });

  it('returns free access when final price is 0', async () => {
    const freeCoupon = { ...COUPON, discountPercent: 100 };
    await kv.put('coupon:WELCOME', JSON.stringify(freeCoupon));
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'WELCOME', tier: 'PRO' }) }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const data = await jsonResponse(res);
    expect(data.success).toBe(true);
    expect(data.discountPercent).toBe(100);
    expect(data.originalPrice).toBe(149);
    expect(data.finalPrice).toBe(0);
    expect(data.checkoutUrl).toBeNull();
    expect(data.message).toBe('Free access granted');
  });

  it('returns checkout url when NOWPAYMENTS_API_KEY set', async () => {
    await kv.put('coupon:WELCOME', JSON.stringify(COUPON));
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'WELCOME', tier: 'PRO' }) }),
      makeEnv(kv, { nowApiKey: 'np_test' }),
    );
    expect(res.status).toBe(200);
    const data = await jsonResponse(res);
    expect(data.success).toBe(true);
    expect(data.discountPercent).toBe(10);
    expect(data.originalPrice).toBe(149);
    expect(data.finalPrice).toBeGreaterThan(0);
    expect(data.checkoutUrl).toContain('pay.test');
  });

  it('increments coupon usage under lock', async () => {
    await kv.put('coupon:WELCOME', JSON.stringify(COUPON));
    await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'WELCOME', tier: 'PRO' }) }),
      makeEnv(kv, { nowApiKey: 'np_test' }),
    );
    const updated = JSON.parse(kv._store.get('coupon:WELCOME')!) as Coupon;
    expect(updated.currentUses).toBe(1);
  });

  it('returns 500 apiError on unexpected failure', async () => {
    // Force loadCoupon to throw
    const brokenKv = {
      get: async () => { throw new Error('KV down'); },
      put: async () => {},
      delete: async () => {},
    };
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'WELCOME', tier: 'PRO' }) }),
      makeEnv(brokenKv),
    );
    expect(res.status).toBe(500);
    const data = await jsonResponse(res);
    expect(data.code).toBe('API_ERROR');
    expect(data.httpStatus).toBe(502);
  });
});