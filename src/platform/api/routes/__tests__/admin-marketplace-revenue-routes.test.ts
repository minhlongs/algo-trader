/**
 * Admin Marketplace Revenue Routes — Integration Tests
 *
 * Covers all four routes registered by registerMarketplaceRevenueRoutes:
 * GET /revenue, GET /revenue/creators, POST /revenue/mark-paid,
 * POST /revenue/mark-paid/:id — success paths, non-admin 403s, zod 400s,
 * 404/409 on the single mark-paid flow, per-id batch outcomes
 * (paid / not_found / skipped / error / non-Error rejection), the defensive
 * 500 paths, and the tier-gate denial path.
 *
 * RevenueService, revenueShareRepository, requireTier, and logger are mocked
 * via vi.hoisted. isAdmin()/getQueryString() run for real against a stubbed
 * req.user set by a tiny middleware in buildApp().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

let allowTier = true;
let userRole = 'admin';

const mocks = vi.hoisted(() => ({
  getRevenueOverview: vi.fn(),
  getAllCreatorPayouts: vi.fn(),
  repoFindById: vi.fn(),
  repoMarkAsPaid: vi.fn(),
  loggerInfo: vi.fn(),
  requireTier: ((minTier: string) => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void }; }, next: () => void) => {
    if (allowTier) next();
    else res.status(403).json({ error: 'Insufficient tier' });
  }) as unknown as typeof import('../../../middleware/feature-gate').requireTier,
}));

vi.mock('../../../marketplace/services/revenue.service', () => ({
  RevenueService: class {
    static getInstance() {
      return {
        getRevenueOverview: mocks.getRevenueOverview,
        getAllCreatorPayouts: mocks.getAllCreatorPayouts,
      };
    }
  },
}));

vi.mock('../../../marketplace/repositories/revenue-share-repository', () => ({
  revenueShareRepository: { findById: mocks.repoFindById, markAsPaid: mocks.repoMarkAsPaid },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: mocks.requireTier,
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerMarketplaceRevenueRoutes } from '../admin-marketplace-revenue-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub auth context: isAdmin() checks req.user.role === 'admin'.
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { role: userRole };
    next();
  });
  const router = Router();
  registerMarketplaceRevenueRoutes(router);
  app.use('/api/v1/admin/marketplace/revenue', router);
  return app;
}

const OVERVIEW = { totalRevenue: 10000, totalPayouts: 8000, pending: 2000, period: { start: '2026-08-01', end: '2026-08-31' } };
const PAYOUT_ROW = { id: 'rev-1', strategyId: 's-1', tenantId: 't-1', status: 'pending', grossRevenueCents: 5000 };

describe('registerMarketplaceRevenueRoutes', () => {
  beforeEach(() => {
    mocks.getRevenueOverview.mockReset();
    mocks.getAllCreatorPayouts.mockReset();
    mocks.repoFindById.mockReset();
    mocks.repoMarkAsPaid.mockReset();
    mocks.loggerInfo.mockReset();
    allowTier = true;
    userRole = 'admin';
    mocks.getRevenueOverview.mockResolvedValue(OVERVIEW);
    mocks.getAllCreatorPayouts.mockResolvedValue([PAYOUT_ROW]);
  });

  describe('GET /revenue', () => {
    it('returns 200 with the platform revenue overview', async () => {
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(OVERVIEW);
      expect(mocks.getRevenueOverview).toHaveBeenCalledWith({});
    });

    it('passes validated periodStart/periodEnd to the service', async () => {
      const res = await request(buildApp())
        .get('/api/v1/admin/marketplace/revenue/revenue?periodStart=2026-08-01T00:00:00Z&periodEnd=2026-08-31T00:00:00Z');
      expect(res.status).toBe(200);
      expect(mocks.getRevenueOverview).toHaveBeenCalledWith(
        expect.objectContaining({ periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-08-31T00:00:00Z' }),
      );
    });

    it('returns 400 with details when the query params are invalid', async () => {
      const res = await request(buildApp())
        .get('/api/v1/admin/marketplace/revenue/revenue?periodStart=not-a-date');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
      expect(res.body.details).toBeDefined();
    });

    it('returns 403 when the caller is not an admin', async () => {
      userRole = 'member';
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden', message: 'Admin access required' });
      expect(mocks.getRevenueOverview).not.toHaveBeenCalled();
    });

    it('returns 500 when the service throws', async () => {
      mocks.getRevenueOverview.mockRejectedValueOnce(new Error('svc down'));
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to get revenue overview' });
    });
  });

  describe('GET /revenue/creators', () => {
    it('returns 200 with all creator payouts', async () => {
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue/creators');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([PAYOUT_ROW]);
      expect(mocks.getAllCreatorPayouts).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when the caller is not an admin', async () => {
      userRole = 'member';
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue/creators');
      expect(res.status).toBe(403);
      expect(mocks.getAllCreatorPayouts).not.toHaveBeenCalled();
    });

    it('returns 500 when the service throws', async () => {
      mocks.getAllCreatorPayouts.mockRejectedValueOnce(new Error('payouts down'));
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue/creators');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to get creator payouts' });
    });
  });

  describe('POST /revenue/mark-paid (batch)', () => {
    it('marks a batch as paid and returns the per-id results', async () => {
      mocks.repoFindById
        .mockResolvedValueOnce({ id: 'rev-1', status: 'pending' })
        .mockResolvedValueOnce({ id: 'rev-2', status: 'pending' });
      mocks.repoMarkAsPaid
        .mockResolvedValueOnce({ id: 'rev-1', status: 'paid' })
        .mockResolvedValueOnce({ id: 'rev-2', status: 'paid' });

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1', 'rev-2'], stripePayoutId: 'po-9' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ processed: 2, paid: 2, results: [
        { id: 'rev-1', status: 'paid' }, { id: 'rev-2', status: 'paid' },
      ] });
      expect(mocks.repoMarkAsPaid).toHaveBeenCalledWith('rev-1', 'po-9');
      expect(mocks.repoMarkAsPaid).toHaveBeenCalledWith('rev-2', 'po-9');
    });

    it('returns not_found for an id that does not exist and skips already-paid rows', async () => {
      mocks.repoFindById
        .mockResolvedValueOnce(null)                                                  // not found
        .mockResolvedValueOnce({ id: 'rev-2', status: 'paid' })                     // already paid
        .mockResolvedValueOnce({ id: 'rev-3', status: 'pending' });                  // pays
      mocks.repoMarkAsPaid.mockResolvedValueOnce({ id: 'rev-3', status: 'paid' });

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['ghost', 'rev-2', 'rev-3'] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        processed: 3, paid: 1,
        results: [
          { id: 'ghost', status: 'not_found', error: 'Revenue share not found' },
          { id: 'rev-2', status: 'skipped', error: 'Already paid' },
          { id: 'rev-3', status: 'paid' },
        ],
      });
      expect(mocks.repoMarkAsPaid).toHaveBeenCalledTimes(1);
      expect(mocks.repoMarkAsPaid).toHaveBeenCalledWith('rev-3', undefined);
    });

    it('records error when markAsPaid throws an Error instance', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'pending' });
      mocks.repoMarkAsPaid.mockRejectedValueOnce(new Error('stripe conflict'));

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1'] });

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([
        { id: 'rev-1', status: 'error', error: 'stripe conflict' },
      ]);
    });

    it('records a generic error when markAsPaid rejects with a non-Error', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'pending' });
      mocks.repoMarkAsPaid.mockRejectedValueOnce('boom');

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1'] });

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([
        { id: 'rev-1', status: 'error', error: 'Unknown error' },
      ]);
    });

    it('returns 400 when ids is missing, empty, or over 100 entries', async () => {
      for (const body of [
        {},
        { ids: [] },
        { ids: Array.from({ length: 101 }, (_, i) => `r${i}`) },
      ]) {
        const res = await request(buildApp())
          .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
          .send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid request body');
      }
      expect(mocks.repoFindById).not.toHaveBeenCalled();
    });

    it('returns 400 when an id in the array is an empty string', async () => {
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1', ''] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 403 when the caller is not an admin', async () => {
      userRole = 'member';
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1'] });
      expect(res.status).toBe(403);
      expect(mocks.repoFindById).not.toHaveBeenCalled();
    });

    it('returns 500 when the outer logging/cleanup step throws', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'pending' });
      mocks.repoMarkAsPaid.mockResolvedValueOnce({ id: 'rev-1', status: 'paid' });
      mocks.loggerInfo.mockImplementationOnce(() => { throw new Error('log down'); });

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid')
        .send({ ids: ['rev-1'] });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to mark as paid' });
    });
  });

  describe('POST /revenue/mark-paid/:id (single)', () => {
    it('returns 200 with the updated record', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'pending' });
      mocks.repoMarkAsPaid.mockResolvedValueOnce({ id: 'rev-1', status: 'paid' });

      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid/rev-1')
        .send({ stripePayoutId: 'po-9' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'rev-1', status: 'paid' });
      expect(mocks.repoMarkAsPaid).toHaveBeenCalledWith('rev-1', 'po-9');
    });

    it('returns 404 when the revenue share does not exist', async () => {
      mocks.repoFindById.mockResolvedValueOnce(null);
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid/ghost')
        .send({ stripePayoutId: 'po-9' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found', message: 'Revenue share ghost not found' });
      expect(mocks.repoMarkAsPaid).not.toHaveBeenCalled();
    });

    it('returns 409 when the revenue share is already paid', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'paid' });
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid/rev-1')
        .send({ stripePayoutId: 'po-9' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Conflict', message: 'Revenue share already paid' });
      expect(mocks.repoMarkAsPaid).not.toHaveBeenCalled();
    });

    it('returns 403 when the caller is not an admin', async () => {
      userRole = 'member';
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid/rev-1')
        .send({});
      expect(res.status).toBe(403);
      expect(mocks.repoFindById).not.toHaveBeenCalled();
    });

    it('returns 500 when the repository update fails', async () => {
      mocks.repoFindById.mockResolvedValueOnce({ id: 'rev-1', status: 'pending' });
      mocks.repoMarkAsPaid.mockRejectedValueOnce(new Error('update down'));
      const res = await request(buildApp())
        .post('/api/v1/admin/marketplace/revenue/revenue/mark-paid/rev-1')
        .send({});
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to mark as paid' });
    });
  });

  describe('tier gate', () => {
    it('blocks the request when the tier gate denies access', async () => {
      allowTier = false;
      const res = await request(buildApp()).get('/api/v1/admin/marketplace/revenue/revenue');
      expect(res.status).toBe(403);
      expect(mocks.getRevenueOverview).not.toHaveBeenCalled();
    });
  });
});
