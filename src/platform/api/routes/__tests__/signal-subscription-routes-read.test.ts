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
// Must resolve to the SAME module the handler imports: from __tests__/ the
// specifier '../../../raas/...' lands in src/platform/raas, which is a
// different file from the src/raas module the handler actually uses. Use the
// path-arithmetic-equivalent ../../../../ instead so the mock intercepts it.
vi.mock('../../../../raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...args: unknown[]) => {
    mocks.assertTenantAccessMock(...args);
    // Mirror the real contract so a 403 assertion means a denial happened.
    const [requested, caller, isAdmin] = args as [string, string | null | undefined, boolean];
    if (isAdmin) return;
    if (!caller) throw new Error('TenantIsolator: no subscriber identity in token');
    if (caller !== requested) throw new Error(`TenantIsolator: cross-tenant access denied - token=${caller} requested=${requested}`);
  },
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
      vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'u1', tier: 'PRO', active: true },
        { id: 'sub_002', subscriberId: 'u2', tier: 'FREE', active: true },
      ]);
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/active').set('Authorization', 'Bearer test-key').set('X-Admin-Key', 'test-admin-key');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      vi.unstubAllEnvs();
    });

    it('returns 503 when X-Admin-Key is absent, even with a valid bearer key', async () => {
      // The route returns every tenant's rows, so an admin key is mandatory.
      // Previously this was reachable with no credential at all.
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/active').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(503);
    });

    it('returns 500 when D1 throws', async () => {
      vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/active').set('Authorization', 'Bearer test-key').set('X-Admin-Key', 'test-admin-key');
      expect(res.status).toBe(500);
      vi.unstubAllEnvs();
    });
  });

  describe('GET /subscriptions/:tenantId', () => {
    it("returns 200 when the caller reads its own tenant", async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue({ id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true });
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/user_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.subscriberId).toBe('user_001');
      // The guard must be reached, not merely present. An earlier revision
      // mocked a module the handler never imports, so these assertions passed
      // against code with no guard at all.
      expect(mocks.assertTenantAccessMock).toHaveBeenCalledTimes(1);
      expect(mocks.assertTenantAccessMock).toHaveBeenCalledWith('user_001', 'user_001', false);
    });

    it('returns 403 when the caller reads another tenant', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue({ id: 'sub_002', subscriberId: 'tenant_abc', tier: 'PRO', active: true });
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/tenant_abc').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(403);
    });

    it('returns 404 when not found', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/user_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).get('/api/v1/signals/subscriptions/user_001').set('Authorization', 'Bearer test-key');
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
      const res = await request(createTestApp()).get('/api/v1/signals/usage/user_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 403 when reading another tenant usage', async () => {
      const res = await request(createTestApp()).get('/api/v1/signals/usage/user_002').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(403);
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
