/**
 * Signal Subscription Routes — D1-backed Integration Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => {
  const resolveSubscriberIdMock = vi.fn();
  const signalSubscriberRepoMock = {
    getBySubscriberId: vi.fn(),
    getActiveSubscriptions: vi.fn(),
    upsert: vi.fn(),
    setActive: vi.fn(),
  };
  const usageMeteringMock = {
    getSnapshot: vi.fn(),
  };
  const assertTenantAccessMock = vi.fn();
  const validateTenantIdMock = vi.fn((id: string) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 64);
  return {
    resolveSubscriberIdMock,
    signalSubscriberRepoMock,
    usageMeteringMock,
    assertTenantAccessMock,
    validateTenantIdMock,
  };
});

vi.mock('../../../middleware/feature-gate', () => {
  const pass: NextFunction = (_req, _res, next: NextFunction) => next();
  return { requireSignalTier: (_tier?: string) => pass };
});

vi.mock('../../../middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: mocks.resolveSubscriberIdMock,
}));

vi.mock('../../../raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...args: any[]) => { mocks.assertTenantAccessMock(...args); },
}));

vi.mock('../../../shared/tenant', () => ({
  validateTenantId: (...args: any[]) => mocks.validateTenantIdMock(...args),
}));

vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: mocks.signalSubscriberRepoMock,
}));

vi.mock('../../../../platform/signals-api/usage-metering-service', () => ({
  usageMetering: mocks.usageMeteringMock,
}));

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
  NowPaymentsIpnPayload: {} as any,
}));

import { signalSubscriptionRouter } from '../signal-subscription-routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalSubscriptionRouter);
  return app;
}

describe('Signal Subscription Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSubscriberIdMock.mockReturnValue({
      subscriberId: 'user_001',
      tier: 'PRO',
    });
  });

  describe('GET /subscriptions/active', () => {
    it('returns 200 with list of active subscriptions', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'u1', tier: 'PRO', active: true },
        { id: 'sub_002', subscriberId: 'u2', tier: 'FREE', active: true },
      ]);
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/subscriptions/active');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/subscriptions/active');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /subscriptions/:tenantId', () => {
    it('returns 200 when subscription found by tenant', async () => {
      const sub = { id: 'sub_001', subscriberId: 'tenant_abc', tier: 'PRO', active: true };
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(sub);
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscriptions/tenant_abc')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.subscriberId).toBe('tenant_abc');
    });

    it('returns 404 when not found', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscriptions/unknown')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscriptions/unknown')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /billing/stats', () => {
    it('returns 200 with tier breakdown', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', tier: 'PRO', active: true },
        { id: 'sub_002', tier: 'PRO', active: true },
        { id: 'sub_003', tier: 'FREE', active: true },
      ]);
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/billing/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.PRO).toBe(2);
      expect(res.body.data.FREE).toBe(1);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/billing/stats');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /usage/:subscriberId', () => {
    it('returns 200 with usage snapshot', async () => {
      mocks.usageMeteringMock.getSnapshot.mockResolvedValue({
        subscriberId: 'user_001',
        period: '2026-07',
        callsThisPeriod: 5,
        periodLimit: 100,
        overageCalls: 0,
      });
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/usage/user_001')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.callsThisPeriod).toBe(5);
      expect(res.body.periodLimit).toBe(100);
    });

    it('returns 404 when subscriberId missing', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/usage/')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 404 when no usage data', async () => {
      mocks.usageMeteringMock.getSnapshot.mockResolvedValue(null);
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/usage/user_002')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when metering throws', async () => {
      mocks.usageMeteringMock.getSnapshot.mockRejectedValue(new Error('metering down'));
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/usage/user_001')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions', () => {
    it('returns 200 with subscription data for valid request', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockResolvedValue({
        id: 'sub_001',
        subscriberId: 'user_001',
        tier: 'PRO',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions')
        .set('Authorization', 'Bearer test-key')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.active).toBe(true);
      expect(res.body).toHaveProperty('message');
      expect(mocks.signalSubscriberRepoMock.upsert).toHaveBeenCalled();
    });

    it('returns 401 without API key', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue(null);
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions')
        .send({});
      expect(res.status).toBe(401);
    });

    it('returns 400 on invalid body', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue({
        subscriberId: 'user_001',
        tier: 'PRO',
      });
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions')
        .set('Authorization', 'Bearer test-key')
        .send({ chatId: 'not-a-number' });
      expect(res.status).toBe(400);
    });

    it('returns 500 when D1 upsert throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions')
        .set('Authorization', 'Bearer test-key')
        .send({});
      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions/subscribe', () => {
    it('returns 200 (alias for POST /subscriptions)', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockResolvedValue({
        id: 'sub_001',
        subscriberId: 'user_001',
        tier: 'PRO',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /subscriptions/:id', () => {
    it('returns 200 when subscription found', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockResolvedValue(undefined);
      const app = createTestApp();
      const res = await request(app)
        .delete('/api/v1/signals/subscriptions/sub_001')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Subscription cancelled');
    });

    it('returns 404 when subscription not found', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([]);
      const app = createTestApp();
      const res = await request(app)
        .delete('/api/v1/signals/subscriptions/nonexistent')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 setActive throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app)
        .delete('/api/v1/signals/subscriptions/sub_001')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /subscriptions/:id/unsubscribe', () => {
    it('returns 200 (alias for DELETE /:id)', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_002', subscriberId: 'user_002', tier: 'FREE', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockResolvedValue(undefined);
      const app = createTestApp();
      const res = await request(app)
        .delete('/api/v1/signals/subscriptions/sub_002/unsubscribe')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Subscription cancelled');
    });
  });

  describe('GET /subscription', () => {
    it('returns 200 when user has subscription', async () => {
      const subscription = {
        id: 'sub_001',
        subscriberId: 'user_001',
        tier: 'PRO',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(subscription);
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscription')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
    });

    it('returns 401 without auth', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue(null);
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/subscription');
      expect(res.status).toBe(401);
    });

    it('returns 404 when no subscription', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscription')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockRejectedValue(new Error('D1 down'));
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/signals/subscription')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

describe('GET /billing/plans', () => {
  it('returns 200 with signals tier plans', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/v1/signals/billing/plans')
      .set('Authorization', 'Bearer test-key');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toHaveProperty('tier');
    expect(res.body.data[0]).toHaveProperty('priceUsd');
  });

  it('returns all 3 signals tiers with pricing', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/v1/signals/billing/plans')
      .set('Authorization', 'Bearer test-key');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const plans = res.body.data;
    const tiers = plans.map((p: any) => p.tier);
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
    let capturedBody: any;
    const fetchMock = vi.fn(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: () => Promise.resolve({ id: 'inv_001', invoice_url: 'https://pay.nowpayments.io/payment/inv_001' }),
      } as any;
    });
    const gAny = globalThis as any;
    gAny.fetch = fetchMock;

    try {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/billing/checkout')
        .set('Authorization', 'Bearer test-key')
        .send({ tier: 'SIGNALS_BASIC' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('invoiceId', 'inv_001');
      expect(res.body).toHaveProperty('checkoutUrl');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedBody.price_amount).toBe(29);
      expect(capturedBody.pay_currency).toBe('usdttrc20');
      expect(capturedBody.order_id).toMatch(/^sig_user_001_/);
    } finally {
      ;(globalThis as any).fetch = originalFetch;
    }
  });
  });

  it('returns 400 for invalid tier', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/signals/billing/checkout')
      .set('Authorization', 'Bearer test-key')
      .send({ tier: 'INVALID_TIER' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when NOWPAYMENTS_API_KEY missing', async () => {
    const original = process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_API_KEY;
    const app = createTestApp();
    const res = await request(app)
      .post('/api/v1/signals/billing/checkout')
      .set('Authorization', 'Bearer test-key')
      .send({ tier: 'SIGNALS_BASIC' });
    expect(res.status).toBe(503);
    process.env.NOWPAYMENTS_API_KEY = original;
  });
});
