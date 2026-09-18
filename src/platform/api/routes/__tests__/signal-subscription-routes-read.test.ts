/**
 * Signal Subscription Routes — Read and Query Endpoints Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  resolveSubscriberIdMock: vi.fn(),
  signalSubscriberRepoMock: { getBySubscriberId: vi.fn(), getActiveSubscriptions: vi.fn(), upsert: vi.fn(), setActive: vi.fn() },
  usageMeteringMock: { getSnapshot: vi.fn() },
  assertTenantAccessMock: vi.fn(),
  validateTenantIdMock: vi.fn((id: string) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 64),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireSignalTier: (_t?: string) => (_req: unknown, _res: unknown, next: NextFunction) => next(),
}));
vi.mock('../../../middleware/signal-tier-resolver', () => ({ resolveSubscriberId: mocks.resolveSubscriberIdMock }));
vi.mock('../../../raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...args: unknown[]) => { mocks.assertTenantAccessMock(...args); },
}));
vi.mock('../../../shared/tenant', () => ({
  validateTenantId: (...args: unknown[]) => mocks.validateTenantIdMock(args[0] as string),
}));
vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({ signalSubscriberRepo: mocks.signalSubscriberRepoMock }));
vi.mock('../../../../platform/signals-api/usage-metering-service', () => ({ usageMetering: mocks.usageMeteringMock }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { signalSubscriptionRouter } from '../signal-subscription-routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalSubscriptionRouter);
  return app;
}

describe('Signal Subscription Routes — Read Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSubscriberIdMock.mockReturnValue({ subscriberId: 'user_001', tier: 'PRO' });
  });

  describe('GET /subscriptions/active', () => {
    it('returns 200 with list of active subscriptions', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'u1', tier: 'PRO', active: true },
        { id: 'sub_002', subscriberId: 'u2', tier: 'FREE', active: true },
      ]);
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/active');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/active');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /subscriptions/:tenantId', () => {
    it('returns 200 when subscription found by tenant', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue({ id: 'sub_001', subscriberId: 'tenant_abc', tier: 'PRO', active: true });
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/tenant_abc').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.subscriberId).toBe('tenant_abc');
    });

    it('returns 404 when not found', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/unknown').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/unknown').set('Authorization', 'Bearer test-key');
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
      const res = await request(createTestApp()).get('/api/v1/signals/billing/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.PRO).toBe(2);
      expect(res.body.data.FREE).toBe(1);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/billing/stats');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /usage/:subscriberId', () => {
    it('returns 200 with usage snapshot', async () => {
      mocks.usageMeteringMock.getSnapshot.mockResolvedValue({ subscriberId: 'user_001', period: '2026-07', callsThisPeriod: 5, periodLimit: 100, overageCalls: 0 });
      const res = await request(createTestApp()).get('/api/v1/signals/usage/user_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.callsThisPeriod).toBe(5);
    });

    it('returns 404 when subscriberId missing', async () => {
      const res = await request(createTestApp()).get('/api/v1/signals/usage/').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 404 when no usage data', async () => {
      mocks.usageMeteringMock.getSnapshot.mockResolvedValue(null);
      const res = await request(createTestApp()).get('/api/v1/signals/usage/user_002').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when metering throws', async () => {
      mocks.usageMeteringMock.getSnapshot.mockRejectedValue(new Error('metering down'));
      const res = await request(createTestApp()).get('/api/v1/signals/usage/user_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /subscription', () => {
    it('returns 200 when user has subscription', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue({ id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true, createdAt: Date.now(), updatedAt: Date.now() });
      const res = await request(createTestApp()).get('/api/v1/signals/subscription').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
    });

    it('returns 401 without auth', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue(null);
      const res = await request(createTestApp()).get('/api/v1/signals/subscription');
      expect(res.status).toBe(401);
    });

    it('returns 404 when no subscription', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const res = await request(createTestApp()).get('/api/v1/signals/subscription').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/subscription').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });
});
