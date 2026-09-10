/**
 * Coupon Routes — Integration Tests
 *
 * Covers the four routes on the exported couponRouter: POST / (create),
 * GET / (list), DELETE /:code (deactivate), POST /apply (discounted
 * NOWPayments checkout). CouponService, logger, and requireTier are mocked;
 * global fetch is stubbed for the invoice-creation path. requireAdmin runs
 * for real against ADMIN_API_KEY set in the test env.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const createMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const deactivateMock = vi.hoisted(() => vi.fn());
const applyMock = vi.hoisted(() => vi.fn());
const recordUseMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../src/platform/billing/coupon-service', () => ({
  CouponService: {
    getInstance: () => ({
      createCoupon: createMock,
      listCoupons: listMock,
      deactivateCoupon: deactivateMock,
      applyCoupon: applyMock,
      recordUse: recordUseMock,
    }),
  },
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import express from 'express';
import { couponRouter } from '../../../../../src/platform/api/routes/coupon-routes';

const ADMIN_KEY = 'test-admin-key-12345';

// supertest cannot drive a bare Router (Router.handle demands a callback only
// an express app supplies) — mount it once in a fresh app per call.
function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(couponRouter);
  return a;
}

function authReq(req: request.Test): request.Test {
  return req.set('x-api-key', ADMIN_KEY);
}

describe('coupon routes', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.ADMIN_API_KEYS = '';
    process.env.NOWPAYMENTS_API_KEY = 'np-key';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEYS;
    delete process.env.NOWPAYMENTS_API_KEY;
  });

  describe('auth guard (requireAdmin)', () => {
    it('rejects a request with no API key (401)', async () => {
      const res = await request(app()).get('/');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('X-API-Key');
      expect(listMock).not.toHaveBeenCalled();
    });

    it('rejects a request with a wrong API key (401)', async () => {
      const res = await request(app()).get('/').set('x-api-key', 'wrong-key');
      expect(res.status).toBe(401);
      expect(listMock).not.toHaveBeenCalled();
    });
  });

  describe('POST / (create)', () => {
    it('creates a coupon for an admin', async () => {
      createMock.mockReturnValue({ code: 'SAVE20', discountPercent: 20 });

      const res = await authReq(request(app()).post('/')).send({ code: 'SAVE20', discountPercent: 20 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, coupon: { code: 'SAVE20', discountPercent: 20 } });
      expect(createMock).toHaveBeenCalledOnce();
    });

    it('returns 400 when the service throws', async () => {
      createMock.mockImplementation(() => {
        throw new Error('duplicate code');
      });

      const res = await authReq(request(app()).post('/')).send({ code: 'SAVE20' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('duplicate code');
    });
  });

  describe('GET / (list)', () => {
    it('returns the coupon list for an admin', async () => {
      listMock.mockReturnValue([{ code: 'SAVE20' }]);

      const res = await authReq(request(app()).get('/'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ coupons: [{ code: 'SAVE20' }] });
    });
  });

  describe('DELETE /:code (deactivate)', () => {
    it('deactivates a coupon for an admin', async () => {
      deactivateMock.mockReturnValue(true);

      const res = await authReq(request(app()).delete('/SAVE20'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(deactivateMock).toHaveBeenCalledWith('SAVE20');
    });
  });

  describe('POST /apply', () => {
    it('returns 400 when code or tier is missing', async () => {
      const res = await request(app()).post('/apply').send({ code: 'SAVE20' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code and tier required');
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an unknown project', async () => {
      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'PRO', project: 'nope' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unknown project');
    });

    it('returns 400 for an invalid tier', async () => {
      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'GOLD', project: 'cashclaw' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid tier');
    });

    it('returns 400 when the coupon is invalid', async () => {
      applyMock.mockReturnValue({ valid: false, error: 'expired' });

      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'PRO', project: 'cashclaw' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('expired');
    });

    it('grants free access on a 100% discount without calling the provider', async () => {
      applyMock.mockReturnValue({ valid: true, discountPercent: 100, discountedPrice: 0 });

      const res = await request(app()).post('/apply').send({ code: 'FREE', tier: 'PRO', project: 'cashclaw' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        discountPercent: 100,
        originalPrice: 149,
        finalPrice: 0,
        message: 'Free access granted',
        checkoutUrl: null,
      });
      expect(recordUseMock).toHaveBeenCalledWith('FREE');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('creates a discounted invoice and returns a checkout URL', async () => {
      applyMock.mockReturnValue({ valid: true, discountPercent: 20, discountedPrice: 119.2 });
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'inv-123' }), { status: 200 }));

      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'PRO', project: 'cashclaw' });

      expect(res.status).toBe(200);
      expect(res.body.checkoutUrl).toBe('https://nowpayments.io/payment?iid=inv-123');
      expect(res.body.finalPrice).toBe(119.2);
      expect(recordUseMock).toHaveBeenCalledWith('SAVE20');
      expect(fetchMock).toHaveBeenCalledWith('https://api.nowpayments.io/v1/invoice', expect.any(Object));
    });

    it('returns 500 when the provider returns no invoice id', async () => {
      applyMock.mockReturnValue({ valid: true, discountPercent: 20, discountedPrice: 119.2 });
      fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'PRO', project: 'cashclaw' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Payment provider error');
      expect(loggerErrorMock).toHaveBeenCalledWith('[Coupon] NOWPayments invoice creation failed', expect.anything());
    });

    it('returns 500 when the provider call throws', async () => {
      applyMock.mockReturnValue({ valid: true, discountPercent: 20, discountedPrice: 119.2 });
      fetchMock.mockRejectedValue(new Error('network down'));

      const res = await request(app()).post('/apply').send({ code: 'SAVE20', tier: 'PRO', project: 'cashclaw' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to create payment');
      expect(loggerErrorMock).toHaveBeenCalledWith('[Coupon] Invoice creation error', expect.anything());
    });
  });
});
