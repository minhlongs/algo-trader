/**
 * Marketplace Strategy Listings Routes — Integration Tests
 *
 * Tests: GET /, POST /publish, GET /:id
 * Mounted under /api/v1/marketplace/strategies via marketplaceStrategyRouter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mocks = vi.hoisted(() => ({
  mockStrategy: { id: 'strat_001', name: 'Test Strategy', status: 'approved', tenantId: 'tenant_001' },
  mockStrategyDetails: {} as Record<string, unknown>,
  mockListResult: {} as Record<string, unknown>,
  mockService: {
    listStrategies: vi.fn().mockResolvedValue(undefined),
    getStrategyWithDetails: vi.fn().mockResolvedValue(undefined),
    createStrategy: vi.fn().mockResolvedValue(undefined),
    createListing: vi.fn().mockResolvedValue(undefined),
  },
}));
mocks.mockStrategyDetails = {
  strategy: mocks.mockStrategy,
  performance: { sharpeRatio: 1.5, totalTrades: 100 },
  reviews: [],
};
mocks.mockListResult = { data: [mocks.mockStrategy], total: 1, page: 1, limit: 20 };

vi.mock('../../../marketplace/services/marketplace.service', () => ({
  MarketplaceService: { getInstance: () => mocks.mockService },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: { getInstance: () => ({ log: vi.fn().mockResolvedValue(undefined) }) },
}));

import { marketplaceStrategyListingsRouter } from '../marketplace-strategy-listings-routes';

function buildApp(user?: { tier?: string }) {
  const app = express();
  app.use(express.json());
  app.use(((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = { id: 'user_001', ...user };
    req.tenant = { id: 'tenant_001', ...user };
    next();
  }) as unknown as import('express').RequestHandler);
  app.use('/', marketplaceStrategyListingsRouter);
  return app;
}

describe('Marketplace Strategy Listings Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockService.listStrategies.mockResolvedValue(mocks.mockListResult);
    mocks.mockService.getStrategyWithDetails.mockResolvedValue(mocks.mockStrategyDetails);
    mocks.mockService.createStrategy.mockResolvedValue(mocks.mockStrategy);
    mocks.mockService.createListing.mockResolvedValue({ id: 'listing_001', strategyId: 'strat_001' });
  });

  describe('GET /', () => {
    it('returns 200 with paginated strategies and supports category filter', async () => {
      const app = buildApp();
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);

      const catRes = await request(app).get('/?category=arbitrage');
      expect(catRes.status).toBe(200);
      expect(mocks.mockService.listStrategies).toHaveBeenCalled();
    });

    it('returns 400 for invalid query params', async () => {
      const res = await request(buildApp()).get('/?page=-1');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /publish', () => {
    it('returns 201 with created strategy and listing', async () => {
      const res = await request(buildApp({ tier: 'PRO' }))
        .post('/publish')
        .send({
          name: 'New Strategy',
          description: 'A test strategy' + 'x'.repeat(50),
          category: 'arbitrage',
          riskLevel: 5,
          priceUsdMonthly: 50,
          minAllocationUsd: 100,
          maxAllocationUsd: 10000,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('strategy');
      expect(res.body).toHaveProperty('listing');
    });

    it('returns 403 for FREE tier and 400 for invalid body', async () => {
      const freeRes = await request(buildApp({ tier: 'FREE' }))
        .post('/publish')
        .send({
          name: 'Test Strategy',
          description: 'A test' + 'x'.repeat(50),
          category: 'arbitrage',
          riskLevel: 5,
          priceUsdMonthly: 0,
        });
      expect(freeRes.status).toBe(403);

      const badRes = await request(buildApp({ tier: 'PRO' })).post('/publish').send({});
      expect(badRes.status).toBe(400);
    });
  });

  describe('GET /:id', () => {
    it('returns 200 with strategy details and 404 for unknown strategy', async () => {
      const app = buildApp();
      const res = await request(app).get('/strat_001');
      expect(res.status).toBe(200);
      expect(res.body.strategy.name).toBe('Test Strategy');

      mocks.mockService.getStrategyWithDetails.mockResolvedValueOnce(null);
      const missingRes = await request(app).get('/nonexistent');
      expect(missingRes.status).toBe(404);
    });
  });
});
