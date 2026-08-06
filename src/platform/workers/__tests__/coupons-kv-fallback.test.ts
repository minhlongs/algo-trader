import { describe, it, expect, beforeEach } from 'vitest';
import { handleValidateCoupon, handleApplyCoupon } from '../api/coupons';
import { handleRedeemCoupon as handleRedeemCouponDirect } from '../coupon-handlers';

function makeEnv(kv: any, sub: any) {
  return { CACHE: kv, SUBSCRIBERS: sub } as any;
}

describe('coupons api/coupons KV fallback (D1 missing / failing)', () => {
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

  async function jsonResponse(res: Response) {
    return { status: res.status, data: JSON.parse(await res.text()) } as const;
  }

  it('uses KV when D1 is not configured', async () => {
    await kv.put('coupon:LAUNCH20', JSON.stringify({ code: 'LAUNCH20', discount_pct: 20, tier_lock: '', free_access: 0, expires_at: '' }));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'STARTER' }),
    });
    const res = await handleValidateCoupon(req, makeEnv(kv, null));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.valid).toBe(true);
  });

  it('falls back to KV when D1 table missing', async () => {
    const failingSub = {
      prepare: () => ({
        bind: () => ({
          first: async () => { throw new Error('D1_ERROR: no such table: coupons: SQLITE_ERROR'); },
        }),
      }),
    };
    await kv.put('coupon:LAUNCH20', JSON.stringify({ code: 'LAUNCH20', discount_pct: 20, tier_lock: '', free_access: 0, expires_at: '' }));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'LAUNCH20', tier: 'PRO' }),
    });
    const res = await handleValidateCoupon(req, makeEnv(kv, failingSub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.valid).toBe(true);
  });

  it('apply increments usage count via KV when D1 missing', async () => {
    await kv.put('coupon:WELCOME', JSON.stringify({ code: 'WELCOME', discount_pct: 10, tier_lock: '', free_access: 0, currentUses: 0 }));
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'WELCOME', userId: 'u1' }),
    });
    const res = await handleApplyCoupon(req, makeEnv(kv, null));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.applied).toBe(true);
    const updated = JSON.parse(await kv.get('coupon:WELCOME')!);
    expect(updated.currentUses).toBe(1);
  });
});
