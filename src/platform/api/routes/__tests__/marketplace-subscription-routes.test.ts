/**
 * Marketplace Subscription Routes — Integration Tests
 *
 * Tests the HTTP layer: request validation, auth gating, service integration, response shapes.
 * Services are mocked — this tests the route glue, not business logic.
 *
 * Flows tested: POST /subscribe, GET /list, PATCH /:id, GET /:id, POST /:id/execute
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoist mock functions BEFORE any imports that might reference them
const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  listSubscriptions: vi.fn(),
  getSubscription: vi.fn(),
  updateSubscriptionStatus: vi.fn(),
  getSubscriptionPerformance: vi.fn(),
  executeForSubscriber: vi.fn(),
  executeActiveForStrategy: vi.fn(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
  requireFeature: () => (_req: any, _res: any, next: any) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../marketplace/services/subscription.service', () => ({
  SubscriptionService: {
    getInstance: () => ({
      subscribe: mocks.subscribe,
      listSubscriptions: mocks.listSubscriptions,
      getSubscription: mocks.getSubscription,
      updateSubscriptionStatus: mocks.updateSubscriptionStatus,
      getSubscriptionPerformance: mocks.getSubscriptionPerformance,
    }),
  },
}));

vi.mock('../../../marketplace/services/marketplace-execution-bridge', () => ({
  MarketplaceExecutionBridge: {
    getInstance: () => ({
      executeForSubscriber: mocks.executeForSubscriber,
      executeActiveForStrategy: mocks.executeActiveForStrategy,
    }),
  },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({ log: vi.fn().mockResolvedValue(undefined) }),
  },
}));

import { marketplaceSubscriptionRouter } from '../marketplace-subscription-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { id: 'tenant_001' };
    req.user = { id: 'user_001', tenantId: 'tenant_001' };
    next();
  });
  app.use('/', marketplaceSubscriptionRouter);
  return app;
}

function fakeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_001', tenantId: 'tenant_001', listingId: 'listing_001', strategyId: 'strat_001',
    status: 'active', allocationPercent: 25, currentInvestmentUsd: 10000, totalPnlUsd: 500,
    subscriptionStartedAt: '2026-06-15T00:00:00.000Z',
    createdAt: '2026-06-15T00:00:00.000Z', updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('Marketplace Subscription Routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ==================== POST /subscribe ====================

  describe('POST /', () => {
    it('returns 400 for missing listingId', async () => {
      const res = await request(buildApp()).post('/').send({ allocationPercent: 25 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid allocationPercent', async () => {
      const res = await request(buildApp()).post('/').send({ listingId: 'listing_001', allocationPercent: 150 });
      expect(res.status).toBe(400);
    });

    it('subscribes and returns subscription with checkoutUrl', async () => {
      mocks.subscribe.mockResolvedValueOnce({
        subscription: fakeSub({ status: 'pending_payment' }),
        checkoutUrl: 'https://nowpayments.io/pay/abc123',
      });

      const res = await request(buildApp()).post('/').send({ listingId: 'listing_001', allocationPercent: 50 });

      expect(res.status).toBe(201);
      expect(res.body.subscription.status).toBe('pending_payment');
      expect(res.body.checkoutUrl).toBe('https://nowpayments.io/pay/abc123');
      expect(mocks.subscribe).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 'tenant_001', listingId: 'listing_001', allocationPercent: 50,
      }));
    });

    it('handles service errors gracefully', async () => {
      mocks.subscribe.mockRejectedValueOnce(new Error('Listing not found'));
      const res = await request(buildApp()).post('/').send({ listingId: 'bad', allocationPercent: 25 });
      expect(res.status).toBe(500);
    });
  });

  // ==================== GET /list ====================

  describe('GET /', () => {
    it('lists subscriptions for current tenant', async () => {
      mocks.listSubscriptions.mockResolvedValueOnce({
        data: [fakeSub({ id: 'sub_001' }), fakeSub({ id: 'sub_002', status: 'paused' })],
        total: 2, page: 1, limit: 20, totalPages: 1,
      });

      const res = await request(buildApp()).get('/');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(mocks.listSubscriptions).toHaveBeenCalledWith('tenant_001', { page: 1, limit: 20 });
    });

    it('filters by status query param', async () => {
      mocks.listSubscriptions.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      const res = await request(buildApp()).get('/?status=active');
      expect(res.status).toBe(200);
      expect(mocks.listSubscriptions).toHaveBeenCalledWith('tenant_001', expect.objectContaining({ status: 'active' }));
    });

    it('rejects invalid status', async () => {
      const res = await request(buildApp()).get('/?status=invalid');
      expect(res.status).toBe(400);
    });
  });

  // ==================== PATCH /:id ====================

  describe('PATCH /:id', () => {
    it('pauses an active subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active', tenantId: 'tenant_001' }));
      mocks.updateSubscriptionStatus.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused' }));

      const res = await request(buildApp()).patch('/sub_001').send({ action: 'pause' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
      expect(mocks.updateSubscriptionStatus).toHaveBeenCalledWith('sub_001', 'pause', 'user_001');
    });

    it('resumes a paused subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused', tenantId: 'tenant_001' }));
      mocks.updateSubscriptionStatus.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active' }));

      const res = await request(buildApp()).patch('/sub_001').send({ action: 'resume' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });

    it('returns 404 for unknown subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(null);
      const res = await request(buildApp()).patch('/no-exist').send({ action: 'pause' });
      expect(res.status).toBe(404);
    });

    it('returns 403 for cross-tenant access', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ tenantId: 'other_tenant' }));
      const res = await request(buildApp()).patch('/sub_001').send({ action: 'pause' });
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(buildApp()).patch('/sub_001').send({ action: 'delete' });
      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /:id ====================

  describe('GET /:id', () => {
    it('returns subscription details for owner', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', tenantId: 'tenant_001' }));

      const res = await request(buildApp()).get('/sub_001');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sub_001');
    });

    it('returns 404 for non-existent subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(null);
      const res = await request(buildApp()).get('/no-exist');
      expect(res.status).toBe(404);
    });
  });

  // ==================== POST /:id/execute ====================

  describe('POST /:id/execute', () => {
    it('executes subscription on-demand', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active', tenantId: 'tenant_001' }));
      mocks.executeForSubscriber.mockResolvedValueOnce({ success: true, pnlUsd: 150 });

      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mocks.executeForSubscriber).toHaveBeenCalledWith('sub_001', {});
    });

    it('returns 403 for cross-tenant execution', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ tenantId: 'other_tenant' }));
      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(403);
    });

    it('returns 400 when executor returns null', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused', tenantId: 'tenant_001' }));
      mocks.executeForSubscriber.mockResolvedValueOnce(null);

      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(400);
    });
  });
});
