/**
 * Marketplace Subscription Routes — Mutation Tests (POST /, PATCH /:id)
 *
 * Tests HTTP layer: validation, auth gating, service integration, response shapes.
 * Services are mocked — tests route glue, not business logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { fakeSub } from './marketplace-subscription-fixtures.js';

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
  app.use((req: Record<string, unknown>, _res, next) => {
    req.tenantId = 'tenant_001';
    req.userId = 'user_001';
    req.license = { tier: 'MASTER' };
    next();
  });
  app.use('/', marketplaceSubscriptionRouter);
  return app;
}

describe('Marketplace Subscription Routes — Mutations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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

  describe('PATCH /:id', () => {
    it('pauses an active subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active', tenantId: 'tenant_001' }));
      mocks.updateSubscriptionStatus.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused' }));

      const res = await request(buildApp()).patch('/sub_001').send({ status: 'paused' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
      expect(mocks.updateSubscriptionStatus).toHaveBeenCalledWith('sub_001', 'pause', 'user_001');
    });

    it('resumes a paused subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'paused', tenantId: 'tenant_001' }));
      mocks.updateSubscriptionStatus.mockResolvedValueOnce(fakeSub({ id: 'sub_001', status: 'active' }));

      const res = await request(buildApp()).patch('/sub_001').send({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });

    it('returns 404 for unknown subscription', async () => {
      mocks.getSubscription.mockResolvedValueOnce(null);
      const res = await request(buildApp()).patch('/no-exist').send({ status: 'paused' });
      expect(res.status).toBe(404);
    });

    it('returns 403 for cross-tenant access', async () => {
      mocks.getSubscription.mockResolvedValueOnce(fakeSub({ tenantId: 'other_tenant' }));
      const res = await request(buildApp()).patch('/sub_001').send({ status: 'paused' });
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(buildApp()).patch('/sub_001').send({ status: 'invalid_status' });
      expect(res.status).toBe(400);
    });
  });
});
