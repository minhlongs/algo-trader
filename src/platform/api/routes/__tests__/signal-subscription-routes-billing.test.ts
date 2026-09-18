/**
 * Signal Subscription Routes — Billing and Checkout Endpoints Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  resolveSubscriberIdMock: vi.fn(),
  signalSubscriberRepoMock: {
    getBySubscriberId: vi.fn(),
    getActiveSubscriptions: vi.fn(),
    upsert: vi.fn(),
    setActive: vi.fn(),
  },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireSignalTier: (_t?: string) => (_req: unknown, _res: unknown, next: NextFunction) => next(),
}));
vi.mock('../../../middleware/signal-tier-resolver', () => ({ resolveSubscriberId: mocks.resolveSubscriberIdMock }));
vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({ signalSubscriberRepo: mocks.signalSubscriberRepoMock }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../billing/nowpayments-service', () => ({
  NOWPAYMENTS_TIERS: {
    SIGNALS_BASIC: { name: 'Signals Basic', price: 29, currency: 'USD' },
    SIGNALS_PRO: { name: 'Signals Pro', price: 99, currency: 'USD' },
    SIGNALS_ENTERPRISE: { name: 'Signals Enterprise', price: 299, currency: 'USD' },
  },
  NowPaymentsService: {
    getInstance: () => ({
      verifyWebhook: vi.fn(() => Promise.resolve(true)),
      getStatusAction: vi.fn(() => 'activate'),
    }),
  },
  NowPaymentsIpnPayload: {} as unknown as Record<string, unknown>,
}));

import { signalSubscriptionRouter } from '../signal-subscription-routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalSubscriptionRouter);
  return app;
}

describe('Signal Subscription Routes — Billing Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSubscriberIdMock.mockReturnValue({ subscriberId: 'user_001', tier: 'PRO' });
  });

  describe('GET /billing/plans', () => {
    it('returns 200 with signals tier plans', async () => {
      const res = await request(createTestApp()).get('/api/v1/signals/billing/plans').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0]).toHaveProperty('tier');
      expect(res.body.data[0]).toHaveProperty('priceUsd');
    });

    it('returns all 3 signals tiers with pricing', async () => {
      const res = await request(createTestApp()).get('/api/v1/signals/billing/plans').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      const tiers = res.body.data.map((p: { tier: string }) => p.tier);
      expect(tiers).toContain('SIGNALS_BASIC');
      expect(tiers).toContain('SIGNALS_PRO');
      expect(tiers).toContain('SIGNALS_ENTERPRISE');
    });
  });

  describe('POST /billing/checkout', () => {
    it('returns 200 with invoice for SIGNALS_BASIC', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue({ subscriberId: 'user_001', tier: 'PRO' });
      process.env.NOWPAYMENTS_API_KEY = 'test-api-key';

      const originalFetch = globalThis.fetch;
      let capturedBody: Record<string, unknown> = {};
      const fetchMock = vi.fn(async (_url: string, opts: { body: string }) => {
        capturedBody = JSON.parse(opts.body) as Record<string, unknown>;
        return {
          ok: true,
          json: () => Promise.resolve({ id: 'inv_001', invoice_url: 'https://pay.nowpayments.io/payment/inv_001' }),
        } as unknown as Response;
      });
      (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;

      try {
        const res = await request(createTestApp())
          .post('/api/v1/signals/billing/checkout')
          .set('Authorization', 'Bearer test-key')
          .send({ tier: 'SIGNALS_BASIC' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('invoiceId', 'inv_001');
        expect(res.body).toHaveProperty('checkoutUrl');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(capturedBody.price_amount).toBe(29);
        expect(capturedBody.pay_currency).toBe('usdttrc20');
        expect(String(capturedBody.order_id)).toMatch(/^sig_user_001_/);
      } finally {
        (globalThis as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
      }
    });

    it('returns 400 for invalid tier', async () => {
      const res = await request(createTestApp())
        .post('/api/v1/signals/billing/checkout')
        .set('Authorization', 'Bearer test-key')
        .send({ tier: 'INVALID_TIER' });
      expect(res.status).toBe(400);
    });

    it('returns 503 when NOWPAYMENTS_API_KEY missing', async () => {
      const original = process.env.NOWPAYMENTS_API_KEY;
      delete process.env.NOWPAYMENTS_API_KEY;
      const res = await request(createTestApp())
        .post('/api/v1/signals/billing/checkout')
        .set('Authorization', 'Bearer test-key')
        .send({ tier: 'SIGNALS_BASIC' });
      expect(res.status).toBe(503);
      process.env.NOWPAYMENTS_API_KEY = original;
    });
  });
});
