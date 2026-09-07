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

  // ── D1 validate paths ────────────────────────────────────────────────────

  function d1Sub(couponRow: Record<string, unknown> | null, opts: { failFirst?: boolean } = {}) {
    let firstCalls = 0;
    return {
      prepare: () => ({
        bind: () => ({
          first: async () => {
            firstCalls++;
            if (opts.failFirst && firstCalls === 1) throw new Error('D1 fail');
            return couponRow;
          },
        }),
      }),
    } as any;
  }

  it('returns valid coupon from D1 when not expired and tier matches', async () => {
    const sub = d1Sub({
      code: 'SAVE10',
      discount_pct: 10,
      tier_lock: '',
      free_access: 0,
      expires_at: '2099-01-01T00:00:00Z',
      usage_count: 3,
    });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10', tier: 'PRO' }),
    });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.valid).toBe(true);
    expect(out.data.coupon.discountPct).toBe(10);
    expect(out.data.coupon.freeAccess).toBe(false);
  });

  it('returns freeAccess=true when free_access is set', async () => {
    const sub = d1Sub({
      code: 'FREEPASS',
      discount_pct: 0,
      tier_lock: '',
      free_access: 1,
      expires_at: '',
      usage_count: 0,
    });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'FREEPASS', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.data.coupon.freeAccess).toBe(true);
    expect(out.data.coupon.tierLock).toBe('');
  });

  it('rejects expired coupon from D1', async () => {
    const sub = d1Sub({
      code: 'OLD',
      discount_pct: 5,
      tier_lock: '',
      free_access: 0,
      expires_at: '2020-01-01T00:00:00Z',
      usage_count: 0,
    });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'OLD', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.valid).toBe(false);
    expect(out.data.reason).toContain('expired');
  });

  it('rejects coupon when tier does not match tier_lock', async () => {
    const sub = d1Sub({
      code: 'ENTERPRISEONLY',
      discount_pct: 15,
      tier_lock: 'ENTERPRISE',
      free_access: 0,
      expires_at: '2099-01-01T00:00:00Z',
      usage_count: 0,
    });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'ENTERPRISEONLY', tier: 'STARTER' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.data.valid).toBe(false);
    expect(out.data.reason).toContain('ENTERPRISE');
  });

  it('returns 404 when D1 coupon not found', async () => {
    const sub = d1Sub(null);
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'MISSING', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(404);
    expect(out.data.error).toContain('not found');
  });

  it('falls back to KV when D1 throws during validate (with cached entry)', async () => {
    await kv.put('coupon:SAFE', JSON.stringify({ code: 'SAFE', discount_pct: 5 }));
    const sub = d1Sub(null, { failFirst: true });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'SAFE', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.valid).toBe(true);
  });

  it('returns 500 when D1 throws and no KV cache exists on validate', async () => {
    const sub = d1Sub(null, { failFirst: true });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'NOPE', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(500);
    expect(out.data.error).toBe('Internal error');
  });

  // ── D1 apply paths ────────────────────────────────────────────────────────

  function d1ApplySub(resultRow: Record<string, unknown> | null) {
    return {
      prepare: () => ({
        bind: () => ({
          first: async () => resultRow,
        }),
      }),
    } as any;
  }

  it('applies coupon via D1 and increments usage_count', async () => {
    const sub = d1ApplySub({ code: 'APP', discount_pct: 12, tier_lock: '', free_access: 0 });
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'APP', userId: 'u1' }) });
    const res = await handleApplyCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.applied).toBe(true);
    expect(out.data.coupon.code).toBe('APP');
    expect(out.data.coupon.discountPct).toBe(12);
  });

  it('returns 404 when D1 apply finds no coupon', async () => {
    const sub = d1ApplySub(null);
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'GONE', userId: 'u1' }) });
    const res = await handleApplyCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(404);
    expect(out.data.error).toBe('Invalid or expired coupon');
  });

  // ── Validation / error paths ─────────────────────────────────────────────

  it('returns 400 when code is missing on validate', async () => {
    const sub = d1Sub(null);
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ code: '', tier: 'PRO' }) });
    const res = await handleValidateCoupon(req, makeEnv(kv, sub));
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.error).toBe('code is required');
  });

  it('returns 400 when code or userId missing on apply', async () => {
    const sub = d1ApplySub(null);
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: '', userId: '' }) }),
      makeEnv(kv, sub),
    );
    const out = await jsonResponse(res);
    expect(out.status).toBe(400);
    expect(out.data.error).toBe('code and userId are required');
  });

  it('returns 404 on apply via KV when coupon not cached', async () => {
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'UNKNOWN', userId: 'u1' }) }),
      makeEnv(kv, null),
    );
    const out = await jsonResponse(res);
    expect(out.status).toBe(404);
    expect(out.data.error).toBe('Coupon not found');
  });

  it('apply increments currentUses via KV when D1 missing', async () => {
    await kv.put('coupon:INC', JSON.stringify({ code: 'INC', discount_pct: 7, currentUses: 4 }));
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'INC', userId: 'u1' }) }),
      makeEnv(kv, null),
    );
    const out = await jsonResponse(res);
    expect(out.data.applied).toBe(true);
    const updated = JSON.parse(await kv.get('coupon:INC')!);
    expect(updated.currentUses).toBe(5);
  });

  it('apply increments usage_count via KV when currentUses absent', async () => {
    await kv.put('coupon:LEGACY', JSON.stringify({ code: 'LEGACY', discount_pct: 3, usage_count: 9 }));
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'LEGACY', userId: 'u1' }) }),
      makeEnv(kv, null),
    );
    const out = await jsonResponse(res);
    expect(out.data.applied).toBe(true);
    const updated = JSON.parse(await kv.get('coupon:LEGACY')!);
    expect(updated.currentUses).toBe(10);
  });

  it('apply falls back to KV when D1 throws', async () => {
    await kv.put('coupon:RESCUE', JSON.stringify({ code: 'RESCUE', discount_pct: 8, currentUses: 0 }));
    const sub = d1ApplySub(null, );
    // Force D1 to throw by making prepare throw
    const throwingSub = { prepare: () => { throw new Error('D1 down'); } } as any;
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'RESCUE', userId: 'u1' }) }),
      makeEnv(kv, throwingSub),
    );
    const out = await jsonResponse(res);
    expect(out.status).toBe(200);
    expect(out.data.applied).toBe(true);
  });

  it('apply returns 500 when D1 throws and no KV cache', async () => {
    const throwingSub = { prepare: () => { throw new Error('D1 down'); } } as any;
    const res = await handleApplyCoupon(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'NOPE', userId: 'u1' }) }),
      makeEnv(kv, throwingSub),
    );
    const out = await jsonResponse(res);
    expect(out.status).toBe(500);
    expect(out.data.error).toBe('Internal error');
  });
});
