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
  requireTier: () => (_req: any, _res: any, next: any) => next(),
  requireFeature: () => (_req: any, _res: any, next: any) => next(),
}));

const mocks = vi.hoisted(() => ({
  mockStrategy: { id: 'strat_001', name: 'Test Strategy', status: 'approved', tenantId: 'tenant_001' },
  mockStrategyDetails: {} as any,
  mockListResult: {} as any,
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
  MarketplaceService: {
    getInstance: () => mocks.mockService,
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { marketplaceStrategyListingsRouter } from '../marketplace-strategy-listings-routes';

function buildApp(user?: { tier?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'user_001', ...user };
    req.tenant = { id: 'tenant_001', ...user };
    next();
  });
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
    it('returns 200 with paginated strategies', async () => {
      const app = buildApp();
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('accepts category filter', async () => {
      const app = buildApp();
      const res = await request(app).get('/?category=arbitrage');

      expect(res.status).toBe(200);
      expect(mocks.mockService.listStrategies).toHaveBeenCalled();
    });

    it('returns 400 for invalid query params', async () => {
      const app = buildApp();
      const res = await request(app).get('/?page=-1');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /publish', () => {
    it('returns 201 with created strategy and listing', async () => {
      const app = buildApp({ tier: 'PRO' });
      const res = await request(app)
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

    it('returns 403 for FREE tier', async () => {
      const app = buildApp({ tier: 'FREE' });
      const res = await request(app)
        .post('/publish')
        .send({
          name: 'Test Strategy',
          description: 'A test' + 'x'.repeat(50),
          category: 'arbitrage',
          riskLevel: 5,
          priceUsdMonthly: 0,
        });

      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid body', async () => {
      const app = buildApp({ tier: 'PRO' });
      const res = await request(app)
        .post('/publish')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /:id', () => {
    it('returns 200 with strategy details', async () => {
      const app = buildApp();
      const res = await request(app).get('/strat_001');

      expect(res.status).toBe(200);
      expect(res.body.strategy.name).toBe('Test Strategy');
    });

    it('returns 404 for unknown strategy', async () => {
      mocks.mockService.getStrategyWithDetails.mockResolvedValueOnce(null);
      const app = buildApp();
      const res = await request(app).get('/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
