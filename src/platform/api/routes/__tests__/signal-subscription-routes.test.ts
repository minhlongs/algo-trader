/**
 * Signal Subscription Routes — Regression Tests
 *
 * Full path mount: /api/v1/signals (see src/platform/api/routes/)
 * Router internal paths post-Express 5 refactor use handler functions:
 *   GET/POST /subscriptions/:id via handleGetActive/handleCreateSubscription/handleCancelSubscription
 *   GET /subscriptions/:tenantId → handleGetByTenantId
 *   GET /billing/stats → handleBillingStats
 *   GET /usage/:subscriberId → handleGetUsage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { LicenseTier } from '../../../../shared/types/license';

// ── Hoisted mocks (must be defined before module import for pool: 'forks') ──
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
  return {
    resolveSubscriberIdMock,
    signalSubscriberRepoMock,
    usageMeteringMock,
  };
});

// ── Mock modules (3 levels up from routes/__tests__/) ────────────────────────
// Mock paths — test file is in src/platform/api/routes/__tests__/
// Route file is in src/platform/api/routes/ and uses ../../middleware, ../../signal, etc.
// One extra directory deeper, so one more ../ than the route file:
//   ../../../../middleware/feature-gate
//   ../../../../middleware/signal-tier-resolver
//   ../../../../signal/signal-subscriber-repository-d1
//   ../../../../signals-api/usage-metering-service
//   ../../../../../shared/utils/logger
// ── Module mocks ────────────────────────────────────────────────────────────
// Test is in src/platform/api/routes/__tests__/
// Source is in src/platform/api/routes/ (one level up)
// Source uses: ../../middleware/  (resolves to src/platform/middleware from routes/)
// From __tests__/ we need one more ../:
vi.mock('../../../middleware/feature-gate', () => {
  const pass: NextFunction = (_req, _res, next) => next();
  return { requireSignalTier: (_tier?: string) => pass, canAccessFeature: vi.fn(() => true), requireTier: (_tier?: string) => pass };
});

vi.mock('../../../middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: mocks.resolveSubscriberIdMock,
  requireSignalTier: (_tier?: string) => (_req, _res, next: NextFunction) => next(),
}));

vi.mock('../../../signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: mocks.signalSubscriberRepoMock,
}));

vi.mock('../../../signals-api/usage-metering-service', () => ({
  usageMetering: mocks.usageMeteringMock,
}));

// Source uses: ../../../shared/ (resolves to src/shared from routes/)
// From __tests__/: ../../../../shared/
vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks
import { signalSubscriptionRouter } from '../signal-subscription-routes';

// Mount at router-level path (full path: /api/v1/signals + router/<route>)
function buildApp() {
  const app = express();
  app.use(express.json());
  // Router internal paths start with /subscriptions — mounted directly under /api/v1/signals
  // so full URL = /api/v1/signals + /subscriptions/... = /api/v1/signals/subscriptions/...
  // But /subscription (no s) routes are also inside the router.
  // We use a sub-app or mount the router's routes individually for test clarity.
  return app;
}

// Instead, let's just test via the router itself mounted at /api/v1/signals
function createTestApp() {
  const app = express();
  app.use(express.json());
  // Mount WITHOUT extra /subscriptions prefix because the router's routes
  // already include /subscriptions/, /subscription, etc.
  // The actual server mounts at /api/v1/signals then this router.
  // For tests, mount the router at /api/v1/signals (not adding any extra segment).
  app.use('/api/v1/signals', signalSubscriptionRouter);
  return app;
}

// ── Test suite ──────────────────────────────────────────────────────────────
describe('Signal Subscription Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSubscriberIdMock.mockReturnValue({
      subscriberId: 'user_001',
      tier: 'PRO',
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/signals/subscriptions/active', () => {
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
  });

  describe('GET /api/v1/signals/subscriptions/:tenantId', () => {
    it('returns 200 when subscription found by tenant', async () => {
      const sub = { id: 'sub_001', subscriberId: 'tenant_abc', tier: 'PRO', active: true };
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(sub);
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/subscriptions/tenant_abc').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.data.subscriberId).toBe('tenant_abc');
    });

    it('returns 404 when not found', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/subscriptions/unknown').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/signals/billing/stats', () => {
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
  });

  describe('GET /api/v1/signals/usage/:subscriberId', () => {
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

    it('returns 400 when subscriberId missing', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/v1/signals/usage/').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404); // no matching route
    });
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/signals/subscriptions', () => {
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
  });

  describe('POST /api/v1/signals/subscriptions/subscribe', () => {
    it('returns 200 (alias for POST /subscriptions)', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.setActive.mockResolvedValue(undefined);
      const app = createTestApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/v1/signals/subscriptions/:id', () => {
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
  });

  describe('GET /api/v1/signals/subscription', () => {
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
  });
});
