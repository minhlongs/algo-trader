import { describe, it, expect, beforeEach } from 'vitest';
import { handleRedeemCoupon, type Env } from '../coupon-handlers';

function makeEnv(kv: any, apiKey?: string): Env {
  return {
    CACHE: kv,
    NOWPAYMENTS_API_KEY: apiKey,
  };
}

async function jsonResponse(res: Response) {
  return { status: res.status, data: JSON.parse(await res.text()) } as const;
}

const BASE_COUPON = {
  code: 'LAUNCH20',
  discountPercent: 20,
  maxUses: 100,
  currentUses: 0,
  validUntil: '2026-12-31T00:00:00.000Z',
  applicableTiers: ['STARTER', 'PRO', 'ELITE'],
  createdAt: new Date().toISOString(),
  active: true,
};

describe('coupon redeem endpoint', () => {
  let kv: any;

  beforeEach(async () => {
    kv = {
      _store: new Map<string, string>(),
      get: async (k: string) => kv._store.get(k) ?? null,
      put: async (k: string, v: string) => kv._store.set(k, v),
      delete: async (k: string) => kv._store.delete(k),
      list: async ({ prefix = '' } = {}) => {
        const keys: { name: string }[] = [];
        for (const k of kv._store.keys()) if (k.startsWith(prefix)) keys.push({ name: k });
        return { keys, cursor: undefined, hasMore: false };
      },
    };
  });

  it('redeem success with discount', async () => {
    await kv.put('coupon:LAUNCH20', JSON.stringify(BASE_COUPON));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'STARTER' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.ok).toBe(true);
    expect(out.data.coupon.code).toBe('LAUNCH20');
    expect(out.data.coupon.discountPct).toBe(20);
    expect(out.data.finalPrice).toBeCloseTo(39.2);
    expect(out.data.originalPrice).toBe(49);
    expect(out.data.discountPercent).toBe(20);
    const updated = JSON.parse(await kv.get('coupon:LAUNCH20')!);
    expect(updated.currentUses).toBe(1);
  });

  it('redeem free access — no checkout URL', async () => {
    const freeCoupon = { ...BASE_COUPON, discountPercent: 100 };
    await kv.put('coupon:FREE100', JSON.stringify(freeCoupon));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'FREE100', tier: 'PRO' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.ok).toBe(true);
    expect(out.data.finalPrice).toBe(0);
    expect(out.data.checkoutUrl).toBeNull();
  });

  it('redeem invalid code returns 404', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'NOPE', tier: 'STARTER' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(404);
    expect(out.data.ok).toBe(false);
  });

  it('redeem expired coupon returns error', async () => {
    const expired = { ...BASE_COUPON, validUntil: '2020-01-01T00:00:00.000Z' };
    await kv.put('coupon:LAUNCH20', JSON.stringify(expired));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'STARTER' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.ok).toBe(false);
    expect(out.data.error).toContain('expired');
  });

  it('redeem usage limit reached returns error', async () => {
    const usedUp = { ...BASE_COUPON, currentUses: 100, maxUses: 100 };
    await kv.put('coupon:LAUNCH20', JSON.stringify(usedUp));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'STARTER' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.ok).toBe(false);
    expect(out.data.error).toContain('usage limit');
  });

  it('redeem wrong tier returns error', async () => {
    await kv.put('coupon:STARTER_ONLY', JSON.stringify({ ...BASE_COUPON, code: 'STARTER_ONLY', applicableTiers: ['STARTER'] }));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'STARTER_ONLY', tier: 'PRO' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.ok).toBe(false);
    expect(out.data.error).toContain('not valid');
  });

  it('redeem missing fields returns 400', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ tier: 'STARTER' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.ok).toBe(false);
  });

  it('redeem works via KV when D1 is missing', async () => {
    await kv.put('coupon:LAUNCH20', JSON.stringify(BASE_COUPON));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'ELITE' }),
    });
    const res = await handleRedeemCoupon(req, makeEnv(kv));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.ok).toBe(true);
    expect(out.data.originalPrice).toBe(499);
  });
});
