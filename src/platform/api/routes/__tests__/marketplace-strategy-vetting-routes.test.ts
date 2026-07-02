/**
 * Admin Marketplace Strategy Vetting Routes — Integration Tests
 *
 * Tests: GET /strategies/pending, POST /strategies/:id/vetting/decision, GET /strategies/:id/history
 * Uses registerMarketplaceVettingRoutes(router) to mount on a test router.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { Router } from 'express';
import request from 'supertest';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

const mocks = vi.hoisted(() => ({
  pendingStrategy: { id: 'strat_001', name: 'Pending Strategy', status: 'pending_vetting', tenantId: 'tenant_001' },
  mockApprovedStrategy: { id: 'strat_001', status: 'approved', name: 'Approved Strategy' },
  mockVettingHistory: [{ id: 'hist_001', action: 'approved', adminUserId: 'admin_001' }],
  mockMarketplaceService: {
    listStrategies: vi.fn().mockResolvedValue(undefined),
    getStrategy: vi.fn().mockResolvedValue(undefined),
  },
  mockVettingService: {
    approveStrategy: vi.fn().mockResolvedValue(undefined),
    rejectStrategy: vi.fn().mockResolvedValue(undefined),
    getVettingHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../marketplace/services/marketplace.service', () => ({
  MarketplaceService: {
    getInstance: () => mocks.mockMarketplaceService,
  },
}));

vi.mock('../../../marketplace/services/vetting.service', () => ({
  VettingService: {
    getInstance: () => mocks.mockVettingService,
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

import { registerMarketplaceVettingRoutes } from '../admin-marketplace-strategy-vetting-routes';

function buildApp(isAdminUser = true) {
  const app = express();
  app.use(express.json());
  const router = Router();
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'user_001', tenantId: 'admin_tenant', role: isAdminUser ? 'admin' : 'user' };
    req.tenant = { id: 'admin_tenant' };
    next();
  });
  registerMarketplaceVettingRoutes(router);
  app.use('/api/admin/marketplace', router);
  return app;
}

describe('Marketplace Strategy Vetting Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockMarketplaceService.listStrategies.mockResolvedValue({
      data: [mocks.pendingStrategy],
      total: 1, page: 1, limit: 50,
    });
    mocks.mockMarketplaceService.getStrategy.mockResolvedValue(mocks.pendingStrategy);
    mocks.mockVettingService.approveStrategy.mockResolvedValue(mocks.mockApprovedStrategy);
    mocks.mockVettingService.rejectStrategy.mockResolvedValue({ ...mocks.pendingStrategy, status: 'rejected' });
    mocks.mockVettingService.getVettingHistory.mockResolvedValue(mocks.mockVettingHistory);
  });

  describe('GET /strategies/pending', () => {
    it('returns 200 with pending strategies for admin', async () => {
      const app = buildApp(true);
      const res = await request(app).get('/api/admin/marketplace/strategies/pending');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('pending_vetting');
    });

    it('returns 403 for non-admin users', async () => {
      const app = buildApp(false);
      const res = await request(app).get('/api/admin/marketplace/strategies/pending');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /strategies/:id/vetting/decision', () => {
    it('returns 200 when approving a strategy', async () => {
      const app = buildApp(true);
      const res = await request(app)
        .post('/api/admin/marketplace/strategies/strat_001/vetting/decision')
        .send({ decision: 'approve', notes: 'Looks good' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });

    it('returns 400 for invalid decision value', async () => {
      const app = buildApp(true);
      const res = await request(app)
        .post('/api/admin/marketplace/strategies/strat_001/vetting/decision')
        .send({ decision: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown strategy', async () => {
      mocks.mockMarketplaceService.getStrategy.mockResolvedValueOnce(null);
      const app = buildApp(true);
      const res = await request(app)
        .post('/api/admin/marketplace/strategies/nonexistent/vetting/decision')
        .send({ decision: 'approve' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /strategies/:id/history', () => {
    it('returns 200 with vetting history', async () => {
      const app = buildApp(true);
      const res = await request(app).get('/api/admin/marketplace/strategies/strat_001/history');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
