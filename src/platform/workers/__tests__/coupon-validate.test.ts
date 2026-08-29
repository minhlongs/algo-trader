/**
 * Tests for coupon-validate.handleValidateCoupon.
 *
 * Drives the validation pipeline through the empty-code, missing-coupon,
 * expired/invalid, valid-discount, free-access (no invoice), no-API-key
 * (discountPercent fallback), per-tier invoice creation with unknown-tier
 * skipping, partial-URL response, and the outer try/catch 500 branch.
 *
 * coupon-helpers is mocked; isNonEmptyString and json run for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLoadCoupon,
  mockValidateCoupon,
  mockCreateInvoice,
  mockJson,
} = vi.hoisted(() => ({
  mockLoadCoupon: vi.fn(),
  mockValidateCoupon: vi.fn(),
  mockCreateInvoice: vi.fn(),
  mockJson: vi.fn((data: unknown, status = 200) => new Response(JSON.stringify(data), { status })),
}));

vi.mock('../coupon-helpers', () => ({
  isNonEmptyString: (s: unknown) => typeof s === 'string' && s.trim().length > 0,
  json: mockJson,
  loadCoupon: mockLoadCoupon,
  validateCoupon: mockValidateCoupon,
  TIER_PRICES: { STARTER: 49, PRO: 149, ELITE: 499 },
  createInvoice: mockCreateInvoice,
}));

import { handleValidateCoupon } from '../coupon-validate';
import type { Coupon } from '../coupon-helpers';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'SAVE10',
    discountPercent: 10,
    maxUses: 100,
    currentUses: 0,
    validUntil: null,
    applicableTiers: ['STARTER', 'PRO'],
    createdAt: new Date().toISOString(),
    active: true,
    ...overrides,
  };
}

function makeEnv(opts: { apiKey?: string | null } = {}) {
  return { CACHE: {} as any, NOWPAYMENTS_API_KEY: opts.apiKey ?? null };
}

function req(body: unknown) {
  return new Request('https://example.com/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function bodyOf(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe('handleValidateCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateInvoice.mockResolvedValue('https://nowpayments.io/pay/xxx');
  });

  it('rejects an empty or missing code with 400', async () => {
    const res = await handleValidateCoupon(req({ code: '  ' }), makeEnv());
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toEqual({ valid: false, reason: 'Enter a code' });
    expect(mockLoadCoupon).not.toHaveBeenCalled();
  });

  it('rejects when the coupon cannot be loaded', async () => {
    mockLoadCoupon.mockResolvedValue(null);
    const res = await handleValidateCoupon(req({ code: 'NOPE' }), makeEnv());
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ valid: false, reason: 'Invalid coupon code' });
  });

  it('returns the validation reason when the coupon is invalid', async () => {
    mockLoadCoupon.mockResolvedValue(makeCoupon({ active: false }));
    mockValidateCoupon.mockReturnValue('Coupon is no longer active');
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv());
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ valid: false, reason: 'Coupon is no longer active' });
  });

  it('returns valid with discount and freeAccess when discountPercent >= 100', async () => {
    mockLoadCoupon.mockResolvedValue(makeCoupon({ discountPercent: 100, applicableTiers: ['STARTER'] }));
    mockValidateCoupon.mockReturnValue(null);
    const res = await handleValidateCoupon(req({ code: 'FREE' }), makeEnv({ apiKey: 'key' }));
    expect(res.status).toBe(200);
    const out = await bodyOf(res);
    expect(out).toEqual({ valid: true, discountPercent: 100, freeAccess: true });
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('falls back to discountPercent-only when there is no API key', async () => {
    mockLoadCoupon.mockResolvedValue(makeCoupon({ discountPercent: 10 }));
    mockValidateCoupon.mockReturnValue(null);
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv());
    expect(res.status).toBe(200);
    const out = await bodyOf(res);
    expect(out).toEqual({ valid: true, discountPercent: 10, freeAccess: false });
    expect(out.urls).toBeUndefined();
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('creates discounted invoice URLs per applicable tier when an API key is present', async () => {
    mockLoadCoupon.mockResolvedValue(makeCoupon({ discountPercent: 10, applicableTiers: ['STARTER', 'PRO', 'ELITE'] }));
    mockValidateCoupon.mockReturnValue(null);
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv({ apiKey: 'key' }));
    expect(res.status).toBe(200);
    const out = await bodyOf(res);
    expect(out.urls).toEqual({
      STARTER: 'https://nowpayments.io/pay/xxx',
      PRO: 'https://nowpayments.io/pay/xxx',
      ELITE: 'https://nowpayments.io/pay/xxx',
    });
    expect(mockCreateInvoice).toHaveBeenCalledTimes(3);
    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'key',
      expect.stringMatching(/^cashclaw_STARTER_SAVE10_\d+$/),
      expect.stringContaining('CashClaw STARTER (10% off with SAVE10)'),
      expect.any(Number),
    );
    // 10% off STARTER (49) -> 44.1
    expect(mockCreateInvoice).toHaveBeenNthCalledWith(1, 'key', expect.any(String), expect.any(String), 44.1);
  });

  it('skips tiers that have no known price', async () => {
    mockLoadCoupon.mockResolvedValue(
      makeCoupon({ discountPercent: 50, applicableTiers: ['STARTER', 'UNKNOWN'] }),
    );
    mockValidateCoupon.mockReturnValue(null);
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv({ apiKey: 'key' }));
    expect(res.status).toBe(200);
    const out = await bodyOf(res);
    expect(out.urls).toEqual({ STARTER: 'https://nowpayments.io/pay/xxx' });
    expect(mockCreateInvoice).toHaveBeenCalledTimes(1);
  });

  it('omits the urls key when every invoice call returns null', async () => {
    mockLoadCoupon.mockResolvedValue(makeCoupon({ discountPercent: 10 }));
    mockValidateCoupon.mockReturnValue(null);
    mockCreateInvoice.mockResolvedValue(null);
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv({ apiKey: 'key' }));
    expect(res.status).toBe(200);
    const out = await bodyOf(res);
    expect(out.urls).toBeUndefined();
    expect(out).toEqual({ valid: true, discountPercent: 10, freeAccess: false });
  });

  it('returns 500 when the request body cannot be parsed', async () => {
    const bad = new Request('https://example.com/api/coupons/validate', {
      method: 'POST',
      body: 'not json',
    });
    const res = await handleValidateCoupon(bad, makeEnv());
    expect(res.status).toBe(500);
    expect(await bodyOf(res)).toEqual({ valid: false, reason: 'Validation failed' });
  });

  it('returns 500 when loadCoupon throws', async () => {
    mockLoadCoupon.mockRejectedValue(new Error('KV down'));
    const res = await handleValidateCoupon(req({ code: 'SAVE10' }), makeEnv());
    expect(res.status).toBe(500);
    expect(await bodyOf(res)).toEqual({ valid: false, reason: 'Validation failed' });
  });
});