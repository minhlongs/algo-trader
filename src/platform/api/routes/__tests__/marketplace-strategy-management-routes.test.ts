/**
 * Marketplace Strategy Management Routes — Integration Tests
 *
 * Tests: PATCH /:id, POST /:id/vetting/request
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
  mockDraftStrategy: { id: 'strat_001', name: 'Draft Strategy', status: 'draft', tenantId: 'tenant_001', creatorId: 'user_001' },
  mockApprovedStrategy: { id: 'strat_002', name: 'Approved Strategy', status: 'approved', tenantId: 'tenant_001', creatorId: 'user_001', backtestSummary: { sharpeRatio: 1.5 } },
  mockService: {
    getStrategy: vi.fn(),
    updateStrategy: vi.fn().mockResolvedValue(undefined),
    updateStrategyStatus: vi.fn().mockResolvedValue(undefined),
    queueVettingJob: vi.fn().mockResolvedValue(undefined),
  },
}));

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

import { marketplaceStrategyManagementRouter } from '../marketplace-strategy-management-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'user_001', tenantId: 'tenant_001', tier: 'PRO' };
    req.tenant = { id: 'tenant_001', tier: 'PRO' };
    next();
  });
  app.use('/', marketplaceStrategyManagementRouter);
  return app;
}

describe('Marketplace Strategy Management Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockService.updateStrategy.mockResolvedValue({ ...mocks.mockDraftStrategy, name: 'Updated' });
    mocks.mockService.updateStrategyStatus.mockResolvedValue({ ...mocks.mockApprovedStrategy, status: 'pending_vetting' });
  });

  describe('PATCH /:id', () => {
    it('returns 200 when strategy is updated by owner', async () => {
      mocks.mockService.getStrategy.mockResolvedValue(mocks.mockDraftStrategy);
      const app = buildApp();
      const res = await request(app)
        .patch('/strat_001')
        .send({ name: 'Updated Strategy' });

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('returns 404 for unknown strategy', async () => {
      mocks.mockService.getStrategy.mockResolvedValue(null);
      const app = buildApp();
      const res = await request(app)
        .patch('/nonexistent')
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid body', async () => {
      mocks.mockService.getStrategy.mockResolvedValue(mocks.mockDraftStrategy);
      const app = buildApp();
      const res = await request(app)
        .patch('/strat_001')
        .send({ name: 'AB' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /:id/vetting/request', () => {
    it('returns 200 when strategy is submitted for vetting', async () => {
      mocks.mockService.getStrategy.mockResolvedValue({
        ...mocks.mockApprovedStrategy, status: 'draft',
        tenantId: 'tenant_001', creatorId: 'user_001',
        backtestSummary: { sharpeRatio: 1.5 },
      });
      const app = buildApp();
      const res = await request(app)
        .post('/strat_002/vetting/request')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body.strategy.status).toBe('pending_vetting');
    });

    it('returns 404 for unknown strategy', async () => {
      mocks.mockService.getStrategy.mockResolvedValue(null);
      const app = buildApp();
      const res = await request(app)
        .post('/nonexistent/vetting/request')
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
