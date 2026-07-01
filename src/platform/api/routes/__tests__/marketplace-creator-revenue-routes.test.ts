/**
 * Marketplace Creator Revenue Routes — Integration Tests
 *
 * Tests the HTTP layer for creator-facing revenue endpoints.
 *
 * Flows:
 * - GET /my-earnings — paginated earnings list
 * - GET /dashboard — totals + recent activity
 * - GET /report — period-specific revenue report
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock revenue service + repository
const mockGetCreatorTotals = vi.fn();
const mockFindAll = vi.fn();
const mockGetRevenueReport = vi.fn();

vi.mock('../../../marketplace/repositories/revenue-share-repository', () => ({
  revenueShareRepository: {
    getCreatorTotals: mockGetCreatorTotals,
    findAll: mockFindAll,
    findById: vi.fn(),
  },
}));

vi.mock('../../../marketplace/services/revenue.service', () => ({
  RevenueService: {
    getInstance: () => ({
      getRevenueReport: mockGetRevenueReport,
    }),
  },
}));

// Dynamic import to include the mock
const { marketplaceCreatorRevenueRouter } = await import('../marketplace-creator-revenue-routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { id: 'creator_001' };
    req.user = { id: 'user_001', tenantId: 'creator_001' };
    next();
  });
  app.use('/', marketplaceCreatorRevenueRouter);
  return app;
}

function fakeRevenueShare(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev_001',
    strategyId: 'strat_001',
    tenantId: 'creator_001',
    subscriptionId: 'sub_001',
    grossRevenueCents: 10000,
    platformShareCents: 2000,
    creatorShareCents: 8000,
    status: 'pending',
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEnd: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('Marketplace Creator Revenue Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /my-earnings ====================

  describe('GET /my-earnings', () => {
    it('returns paginated earnings for the current creator', async () => {
      mockFindAll.mockResolvedValueOnce({
        data: [fakeRevenueShare({ id: 'rev_001' }), fakeRevenueShare({ id: 'rev_002', status: 'paid' })],
        total: 2, page: 1, limit: 20, totalPages: 1,
      });

      const res = await request(buildApp()).get('/my-earnings');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(mockFindAll).toHaveBeenCalledWith(
        { tenantId: 'creator_001', status: undefined },
        { page: 1, limit: 20 },
        { field: 'created_at', order: 'desc' },
      );
    });

    it('filters by status', async () => {
      mockFindAll.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      const res = await request(buildApp()).get('/my-earnings?status=paid');

      expect(res.status).toBe(200);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'creator_001' }),
        expect.objectContaining({ page: 1 }),
        expect.anything(),
      );
    });

    it('paginates with custom limit', async () => {
      mockFindAll.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });

      const res = await request(buildApp()).get('/my-earnings?limit=10&page=2');

      expect(res.status).toBe(200);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.anything(),
        { page: 2, limit: 10 },
        expect.anything(),
      );
    });
  });

  // ==================== GET /dashboard ====================

  describe('GET /dashboard', () => {
    it('returns creator dashboard with totals and recent activity', async () => {
      mockGetCreatorTotals.mockResolvedValueOnce({
        totalRevenue: 50000,
        totalPayouts: 32000,
        pending: 18000,
      });

      mockFindAll
        .mockResolvedValueOnce({ data: [fakeRevenueShare({ id: 'rev_003', status: 'pending' })], total: 1, page: 1, limit: 5, totalPages: 1 })
        .mockResolvedValueOnce({ data: [fakeRevenueShare({ id: 'rev_001', status: 'paid' })], total: 1, page: 1, limit: 5, totalPages: 1 });

      const res = await request(buildApp()).get('/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.totalEarningsCents).toBe(50000);
      expect(res.body.totalPaidCents).toBe(32000);
      expect(res.body.pendingPayoutCents).toBe(18000);
      expect(res.body.pendingCount).toBe(1);
      expect(res.body.recentPending).toBeDefined();
      expect(res.body.recentPaid).toBeDefined();
    });
  });

  // ==================== GET /report ====================

  describe('GET /report', () => {
    it('returns revenue report for current month by default', async () => {
      mockGetRevenueReport.mockResolvedValueOnce({
        tenantId: 'creator_001',
        period: { start: new Date('2026-06-01'), end: new Date() },
        totalGrossRevenueCents: 10000,
        totalPlatformShareCents: 2000,
        totalCreatorShareCents: 8000,
        paidCents: 0,
        pendingCents: 8000,
        voidCents: 0,
        transactionCount: 1,
        records: [fakeRevenueShare()],
      });

      const res = await request(buildApp()).get('/report');

      expect(res.status).toBe(200);
      expect(res.body.totalGrossRevenueCents).toBe(10000);
      expect(res.body.totalCreatorShareCents).toBe(8000);
    });

    it('accepts custom date range', async () => {
      mockGetRevenueReport.mockResolvedValueOnce({
        tenantId: 'creator_001',
        period: { start: new Date('2026-05-01'), end: new Date('2026-05-31') },
        totalGrossRevenueCents: 5000,
        totalPlatformShareCents: 1000,
        totalCreatorShareCents: 4000,
        paidCents: 4000,
        pendingCents: 0,
        voidCents: 0,
        transactionCount: 1,
        records: [],
      });

      const res = await request(buildApp()).get('/report?start=2026-05-01&end=2026-05-31');

      expect(res.status).toBe(200);
      expect(res.body.totalCreatorShareCents).toBe(4000);
    });
  });
});
