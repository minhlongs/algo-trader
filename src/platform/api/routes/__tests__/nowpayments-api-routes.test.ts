/**
 * NOWPayments Invoice API Routes — Integration Tests
 *
 * Covers POST /invoice on the exported nowpaymentsApiRouter: zod 400 on an
 * invalid tier, 400 when the tier has no config, 503 when the API key is
 * missing, 200 success (returns invoiceId + checkoutUrl), 502 when the
 * provider returns a non-ok response, and 502 on a provider exception.
 *
 * NOWPAYMENTS_TIERS, logger, and global fetch are mocked; the router is
 * mounted in a fresh express app per call because supertest cannot drive a
 * bare Router.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

// NOWPAYMENTS_API_KEY is captured at module load time by the router
// (const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || ''),
// so it must be present before the router module is imported below.
vi.hoisted(() => {
  process.env.NOWPAYMENTS_API_KEY = 'np-test-key';
});

vi.mock('../../../billing/nowpayments-service', () => ({
  NOWPAYMENTS_TIERS: {
    PRO: { tier: 'PRO', invoiceId: '', price: 99, currency: 'USD', name: 'Pro Trader' },
    ENTERPRISE: { tier: 'ENTERPRISE', invoiceId: '', price: 299, currency: 'USD', name: 'Enterprise' },
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

import { nowpaymentsApiRouter } from '../nowpayments-api-routes';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(nowpaymentsApiRouter);
  return a;
}

describe('nowpaymentsApiRouter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // NOWPAYMENTS_API_KEY is bound at module load (const = process.env.X),
    // so it must be set before the router module is imported — see the
    // vi.hoisted block at the top of this file.
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 for an invalid tier', async () => {
    const res = await request(app()).post('/invoice').send({ tier: 'GOLD' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'tier', message: expect.any(String) })]),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the tier has no config', async () => {
    const res = await request(app()).post('/invoice').send({ tier: 'SIGNALS_BASIC' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No configuration found for tier');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the API key is not configured', async () => {
    // The router binds NOWPAYMENTS_API_KEY at import time, so we must reload
    // it in a clean module registry with the env var unset.
    vi.resetModules();
    vi.stubEnv('NOWPAYMENTS_API_KEY', '');
    try {
      const { nowpaymentsApiRouter: freshRouter } = await import('../nowpayments-api-routes');
      const a = express();
      a.use(express.json());
      a.use(freshRouter);

      const res = await request(a).post('/invoice').send({ tier: 'PRO' });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('NOWPayments API key not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('creates an invoice and returns the checkout URL', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'inv-42', invoice_url: 'https://nowpayments.io/i/inv-42' }), { status: 200 }),
    );

    const res = await request(app()).post('/invoice').send({ tier: 'PRO' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ invoiceId: 'inv-42', checkoutUrl: 'https://nowpayments.io/i/inv-42' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.nowpayments.io/v1/invoice', expect.any(Object));
    expect(loggerInfoMock).toHaveBeenCalledWith('[NOWPayments API] Invoice created', expect.anything());
  });

  it('returns 502 when the provider responds with a non-ok status', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'boom' }), { status: 500 }));

    const res = await request(app()).post('/invoice').send({ tier: 'ENTERPRISE' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Payment provider unavailable');
    expect(loggerErrorMock).toHaveBeenCalledWith('[NOWPayments API] Invoice creation failed', expect.anything());
  });

  it('returns 502 when the provider call throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const res = await request(app()).post('/invoice').send({ tier: 'PRO' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Payment provider unavailable');
    expect(loggerErrorMock).toHaveBeenCalledWith('[NOWPayments API] Invoice creation error', expect.anything());
  });
});
