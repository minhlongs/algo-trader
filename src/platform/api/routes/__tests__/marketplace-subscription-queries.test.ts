/**
 * Marketplace Subscription Routes — Query & Execute Tests (GET /, GET /:id, POST /:id/execute)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { fakeSub } from './marketplace-subscription-fixtures.js';

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
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { marketplaceSubscriptionRouter } from '../marketplace-subscription-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      tenantId: 'tenant_001',
      userId: 'user_001',
      license: { tier: 'MASTER' },
    });
    next();
  });
  app.use('/', marketplaceSubscriptionRouter);
  return app;
}

describe('Marketplace Subscription Routes — Queries & Execute', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // GET /list

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

  // GET /:id

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

  // POST /:id/execute

  describe('POST /:id/execute', () => {
    it('executes subscription on-demand', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active', tenantId: 'tenant_001' }));
      mocks.executeForSubscriber.mockResolvedValueOnce({ success: true, pnlUsd: 150 });

      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.subscriptionId).toBe('sub_001');
      expect(res.body.result.success).toBe(true);
      expect(mocks.executeForSubscriber).toHaveBeenCalledWith('sub_001', {});
    });

    it('returns 403 for cross-tenant execution', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ tenantId: 'other_tenant' }));
      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(403);
    });

    it('returns 200 with null result when executor returns null', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused', tenantId: 'tenant_001' }));
      mocks.executeForSubscriber.mockResolvedValueOnce(null);

      const res = await request(buildApp()).post('/sub_001/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.result).toBeNull();
    });
  });
});
