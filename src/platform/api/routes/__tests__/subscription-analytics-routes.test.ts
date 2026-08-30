/**
 * Subscription Analytics Routes — Integration Tests
 *
 * Covers all four GET endpoints on the PRO-tier subscription router:
 * /dashboard, /ltv, /cohorts, /churn — each success path and each
 * service-error path (getAllLicenses throws → 500 with error body), plus the
 * tier-gate denial path.
 *
 * The router's imports (LicenseService, SubscriptionService, requireTier,
 * revenue-analytics, logger) are all replaced with deterministic mocks via
 * vi.hoisted so no real DB, auth middleware, or analytics math is loaded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

let allowTier = true;
const mocks = vi.hoisted(() => ({
  listLicenses: vi.fn(),
  getAllSubscriptions: vi.fn(),
  requireTier: vi.fn(() => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void }; }, next: () => void) => {
    if (allowTier) next();
    else res.status(403).json({ error: 'Insufficient tier' });
  }),
  metrics: {
    mrr: 1000, arr: 12000, totalCustomers: 10, activeCustomers: 9,
    churnRate: 0.1, ltv: 500, arpu: 100, mrrGrowthRate: 0.05,
  },
  cohortData: [{ month: '2026-08', customers: 5, retained: 4, revenue: 400 }],
  churn: {
    currentMonthChurn: 1,
    churnByTier: { PRO: 1, ENTERPRISE: 0, MASTER: 0, FREE: 0 },
    avgLifespanDays: 180,
    atRiskCustomers: [{ licenseId: 'l-1' }, { licenseId: 'l-2' }],
  },
  ltv: { PRO: 500, ENTERPRISE: 2000, MASTER: 4000, FREE: 0 },
}));

function mkLicenses() {
  return [
    { id: 'l-1', tier: 'FREE', status: 'active', usageCount: 0, maxUsage: undefined },
    { id: 'l-2', tier: 'PRO', status: 'active', usageCount: 5, maxUsage: 10 },
    { id: 'l-3', tier: 'ENTERPRISE', status: 'active', usageCount: 50, maxUsage: 200 },
    { id: 'l-4', tier: 'MASTER', status: 'active', usageCount: 100, maxUsage: 500 },
  ];
}

function mkSubscriptions() {
  return [
    { id: 's-1', tier: 'PRO', status: 'active', amount: 100 },
    { id: 's-2', tier: 'ENTERPRISE', status: 'active', amount: 500 },
  ];
}

vi.mock('../../../billing/license-service', () => ({
  LicenseService: class {
    static getInstance() {
      return { listLicenses: mocks.listLicenses };
    }
  },
}));

vi.mock('../../../billing/subscription-service', () => ({
  SubscriptionService: class {
    static getInstance() {
      return { getAllSubscriptions: mocks.getAllSubscriptions };
    }
  },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: mocks.requireTier,
}));

vi.mock('../../../billing/revenue-analytics', () => ({
  calculateRevenueMetrics: () => mocks.metrics,
  buildCohortAnalysis: () => mocks.cohortData,
  analyzeChurn: () => mocks.churn,
  predictLTV: (tier: string) => (mocks.ltv as Record<string, number>)[tier] ?? 0,
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { subscriptionAnalyticsRouter } from '../subscription-analytics-routes';

function buildApp() {
  const app = express();
  app.use('/api/v1/analytics/subscription', subscriptionAnalyticsRouter);
  return app;
}

describe('subscriptionAnalyticsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowTier = true;
    mocks.requireTier.mockImplementation(
      () => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void }; }, next: () => void) => {
        if (allowTier) next();
        else res.status(403).json({ error: 'Insufficient tier' });
      },
    );
    mocks.listLicenses.mockResolvedValue({ licenses: mkLicenses() });
    mocks.getAllSubscriptions.mockResolvedValue(mkSubscriptions());
  });

  describe('GET /dashboard', () => {
    it('returns 200 with the subscription health metrics', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/dashboard');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        mrr: 1000, arr: 12000, totalCustomers: 10, activeCustomers: 9,
        churnRate: 0.1, ltv: 500, arpu: 100, mrrGrowthRate: 0.05,
        atRiskCount: 2,
      });
      expect(res.body.period).toMatch(/^\d{4}-\d{2}$/);
      expect(res.body.churnBreakdown).toEqual(mocks.churn.churnByTier);
      expect(res.body.avgLifespanDays).toBe(180);
    });

    it('returns 500 when license lookup fails', async () => {
      mocks.listLicenses.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/dashboard');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to compute subscription dashboard' });
    });
  });

  describe('GET /ltv', () => {
    it('returns 200 with per-tier LTV, recommended, and portfolio', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/ltv');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        lifespanDays: 365,
        recommended: 500,
        totalPortfolio: 6500,
      });
      expect(res.body.byTier).toEqual(mocks.ltv);
    });

    it('honors the lifespanDays query parameter', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/ltv?lifespanDays=730');
      expect(res.status).toBe(200);
      expect(res.body.lifespanDays).toBe(730);
    });

    it('falls back to default lifespanDays when the query is NaN', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/ltv?lifespanDays=abc');
      expect(res.status).toBe(200);
      expect(res.body.lifespanDays).toBe(365);
    });

    it('falls back to the zero-price LTV path for tiers with no licenses', async () => {
      mocks.listLicenses.mockResolvedValueOnce({ licenses: [mkLicenses()[1]!] }); // PRO only

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/ltv');
      expect(res.status).toBe(200);
      expect(res.body.byTier.PRO).toBe(500);
      expect(res.body.byTier.FREE).toBe(0);
      expect(res.body.byTier.ENTERPRISE).toBe(2000);
      expect(res.body.byTier.MASTER).toBe(4000);
    });

    it('returns 500 when license lookup fails', async () => {
      mocks.listLicenses.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/ltv');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to compute LTV' });
    });
  });

  describe('GET /cohorts', () => {
    it('returns 200 with the cohort analysis', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/cohorts');
      expect(res.status).toBe(200);
      expect(res.body.cohorts).toEqual(mocks.cohortData);
    });

    it('returns 500 when license lookup fails', async () => {
      mocks.listLicenses.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/cohorts');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to compute cohort analysis' });
    });
  });

  describe('GET /churn', () => {
    it('returns 200 with churn metrics and at-risk list', async () => {
      const res = await request(buildApp()).get('/api/v1/analytics/subscription/churn');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        currentMonthChurn: 1,
        avgLifespanDays: 180,
        atRiskCustomerCount: 2,
      });
      expect(res.body.churnByTier).toEqual(mocks.churn.churnByTier);
      expect(res.body.atRiskCustomerIds).toEqual([{ licenseId: 'l-1' }, { licenseId: 'l-2' }]);
    });

    it('returns 500 when license lookup fails', async () => {
      mocks.listLicenses.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/churn');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to compute churn analysis' });
    });
  });

  describe('tier gate', () => {
    it('blocks the request when the tier gate denies access', async () => {
      allowTier = false;

      const res = await request(buildApp()).get('/api/v1/analytics/subscription/dashboard');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Insufficient tier' });
      expect(mocks.listLicenses).not.toHaveBeenCalled();
    });
  });
});