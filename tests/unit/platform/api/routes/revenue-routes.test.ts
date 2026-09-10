/**
 * Revenue Routes — Integration Tests
 *
 * Covers all five GET endpoints on the ENTERPRISE-tier revenue router:
 * /summary, /mrr, /usage, /overage, /churn — each success path, query-parameter
 * variants, and the service-failure path (500 with the thrown Error's message).
 * The router's imports (UsageMeteringService, revenueShareRepository,
 * requireTier, logger) are all replaced with deterministic mocks via vi.hoisted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

let allowTier = true;

const mocks = vi.hoisted(() => ({
  getRevenueSummary: vi.fn(),
  getAllUsageData: vi.fn(),
  repoFindAll: vi.fn(),
  requireTier: ((minTier: string) => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void }; }, next: () => void) => {
    if (allowTier) next();
    else res.status(403).json({ error: 'Insufficient tier' });
  }) as unknown as typeof import('../../../../../src/platform/middleware/feature-gate').requireTier,
  usageRows: [
    {
      licenseKey: 'lic-a', period: '2026-08', tier: 'PRO' as const, monthlyLimit: 100,
      currentUsage: 80, remaining: 20, percentUsed: 0.8, isExceeded: false,
      overageUnits: 0, overageCost: 0, lastSyncedAt: 1000,
    },
    {
      licenseKey: 'lic-b', period: '2026-08', tier: 'ENTERPRISE' as const, monthlyLimit: 200,
      currentUsage: 250, remaining: 0, percentUsed: 1.25, isExceeded: true,
      overageUnits: 50, overageCost: 15.5, lastSyncedAt: 2000,
    },
    {
      licenseKey: 'lic-c', period: '2026-08', tier: 'PRO' as const, monthlyLimit: 100,
      currentUsage: 90, remaining: 10, percentUsed: 0.9, isExceeded: false,
      overageUnits: 0, overageCost: 0, lastSyncedAt: 0,
    },
  ],
  revenueSummary: {
    subscriptionRevenue: 0,
    overageRevenue: 15.5,
    totalRevenue: 15.5,
    customerCount: 3,
    averageRevenuePerCustomer: 15.5 / 3,
  },
}));

vi.mock('../../../../../src/platform/billing/usage-metering', () => ({
  UsageMeteringService: class {
    static getInstance() {
      return { getRevenueSummary: mocks.getRevenueSummary, getAllUsageData: mocks.getAllUsageData };
    }
  },
}));

vi.mock('../../../../../src/platform/marketplace/repositories/revenue-share-repository', () => ({
  revenueShareRepository: { findAll: mocks.repoFindAll },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: mocks.requireTier,
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { revenueRouter } from '../../../../../src/platform/api/routes/revenue';

function buildApp() {
  const app = express();
  app.use('/api/v1/revenue', revenueRouter);
  return app;
}

describe('revenueRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowTier = true;
    mocks.getRevenueSummary.mockResolvedValue(mocks.revenueSummary);
    mocks.getAllUsageData.mockResolvedValue(mocks.usageRows);
    // Default: empty repo results for both current and previous month.
    mocks.repoFindAll.mockResolvedValue({ data: [], total: 0 });
  });

  describe('GET /summary', () => {
    it('returns 200 with the revenue summary joined with MRR data', async () => {
      // calculateMRR does one repo findAll per month: [current, previous]
      mocks.repoFindAll
        .mockResolvedValueOnce({ data: [{ grossRevenueCents: 25000 }], total: 1 })
        .mockResolvedValueOnce({ data: [{ grossRevenueCents: 20000 }], total: 1 });

      const res = await request(buildApp()).get('/api/v1/revenue/summary');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        mrr: 250,
        arr: 3000,
        overageRevenue: 15.5,
        totalRevenue: 15.5,
        customerCount: 3,
        growthRate: 25,
      });
      expect(res.body.period).toMatch(/^\d{4}-\d{2}$/);
    });

    it('returns 500 with the thrown message when the service fails', async () => {
      mocks.getRevenueSummary.mockRejectedValueOnce(new Error('summary down'));

      const res = await request(buildApp()).get('/api/v1/revenue/summary');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'summary down' });
    });

    it('returns 500 with the fallback message for non-Error throws', async () => {
      mocks.getRevenueSummary.mockRejectedValueOnce('boom-string' as never);

      const res = await request(buildApp()).get('/api/v1/revenue/summary');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch revenue summary' });
    });
  });

  describe('GET /mrr', () => {
    it('returns 200 with the MRR breakdown', async () => {
      mocks.repoFindAll
        .mockResolvedValueOnce({ data: [{ grossRevenueCents: 30000 }, { grossRevenueCents: 10000 }], total: 2 })
        .mockResolvedValueOnce({ data: [{ grossRevenueCents: 20000 }], total: 1 });

      const res = await request(buildApp()).get('/api/v1/revenue/mrr');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        currentMRR: 400,
        previousMRR: 200,
        mrrGrowth: 200,
        mrrGrowthRate: 100,
        breakdown: { subscriptionMRR: 400, overageMRR: 0 },
      });
    });

    it('reports 0 growth rate when the previous month had no revenue', async () => {
      mocks.repoFindAll
        .mockResolvedValueOnce({ data: [{ grossRevenueCents: 5000 }], total: 1 })
        .mockResolvedValueOnce({ data: [], total: 0 });

      const res = await request(buildApp()).get('/api/v1/revenue/mrr');

      expect(res.status).toBe(200);
      expect(res.body.previousMRR).toBe(0);
      expect(res.body.mrrGrowthRate).toBe(0);
      expect(res.body.mrrGrowth).toBe(50);
    });

    it('returns 500 when the repository throws', async () => {
      mocks.repoFindAll.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/v1/revenue/mrr');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db down' });
    });
  });

  describe('GET /usage', () => {
    it('returns 200 with mapped customer usage rows', async () => {
      const res = await request(buildApp()).get('/api/v1/revenue/usage');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.customers).toHaveLength(3);
      expect(res.body.customers[0]).toEqual({
        licenseKey: 'lic-a',
        tier: 'PRO',
        tradesUsed: 80,
        tradesLimit: 100,
        percentUsed: 0.8,
        overageUnits: 0,
        overageCost: 0,
        lastActiveAt: 1000,
      });
      // lastSyncedAt fallback: missing (undefined) becomes 0
      expect(res.body.customers[2].lastActiveAt).toBe(0);
    });

    it('applies the limit query parameter', async () => {
      const res = await request(buildApp()).get('/api/v1/revenue/usage?limit=1');

      expect(res.status).toBe(200);
      expect(res.body.customers).toHaveLength(1);
      expect(res.body.total).toBe(3); // total is pre-slice
    });

    it('passes an explicit period through to the service', async () => {
      const res = await request(buildApp()).get('/api/v1/revenue/usage?period=2025-12');

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('2025-12');
      expect(mocks.getAllUsageData).toHaveBeenCalledWith('2025-12');
    });

    it('returns 500 when the service throws', async () => {
      mocks.getAllUsageData.mockRejectedValueOnce(new Error('usage down'));

      const res = await request(buildApp()).get('/api/v1/revenue/usage');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'usage down' });
    });
  });

  describe('GET /overage', () => {
    it('returns 200 with only the customers that have overage units', async () => {
      const res = await request(buildApp()).get('/api/v1/revenue/overage');

      expect(res.status).toBe(200);
      expect(res.body.totalOverageRevenue).toBe(15.5);
      expect(res.body.customersWithOverage).toBe(1);
      expect(res.body.details).toEqual([
        { licenseKey: 'lic-b', overageUnits: 50, overageCost: 15.5 },
      ]);
    });

    it('honors a custom period parameter', async () => {
      const res = await request(buildApp()).get('/api/v1/revenue/overage?period=2025-01');

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('2025-01');
      expect(mocks.getRevenueSummary).toHaveBeenCalledWith('2025-01');
      expect(mocks.getAllUsageData).toHaveBeenCalledWith('2025-01');
    });

    it('returns 500 when the service throws', async () => {
      mocks.getRevenueSummary.mockRejectedValueOnce(new Error('overage down'));

      const res = await request(buildApp()).get('/api/v1/revenue/overage');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'overage down' });
    });
  });

  describe('GET /churn', () => {
    it('returns 200 with churn computed from tenant turnover', async () => {
      // First call: current month. Second call: previous month.
      mocks.repoFindAll
        .mockResolvedValueOnce({
          data: [
            { tenantId: 't-keep', grossRevenueCents: 1000 },
            { tenantId: 't-keep', grossRevenueCents: 2000 },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          data: [
            { tenantId: 't-keep', grossRevenueCents: 500 },
            { tenantId: 't-gone', grossRevenueCents: 700 },
          ],
          total: 2,
        });

      const res = await request(buildApp()).get('/api/v1/revenue/churn?period=2026-08');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        period: '2026-08',
        totalCustomers: 1, // t-keep only
        churnedCustomers: 1, // t-gone vanished
        churnRate: 50,
        revenueChurn: -18, // prev $12 - current $30
        reasons: {},
      });
    });

    it('reports zero churn when the previous month had no customers', async () => {
      mocks.repoFindAll
        .mockResolvedValueOnce({ data: [{ tenantId: 't-a', grossRevenueCents: 100 }], total: 1 })
        .mockResolvedValueOnce({ data: [], total: 0 });

      const res = await request(buildApp()).get('/api/v1/revenue/churn');

      expect(res.status).toBe(200);
      expect(res.body.churnedCustomers).toBe(0);
      expect(res.body.churnRate).toBe(0);
      expect(res.body.revenueChurn).toBe(-1);
    });

    it('returns 500 when the repository throws', async () => {
      mocks.repoFindAll.mockRejectedValueOnce(new Error('churn db down'));

      const res = await request(buildApp()).get('/api/v1/revenue/churn');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'churn db down' });
    });
  });

  describe('tier gate', () => {
    it('blocks the request when the tier gate denies access', async () => {
      allowTier = false;

      const res = await request(buildApp()).get('/api/v1/revenue/summary');
      expect(res.status).toBe(403);
      expect(mocks.getRevenueSummary).not.toHaveBeenCalled();
    });
  });
});
