/**
 * Subscriber P&L API Routes — Integration Tests
 *
 * Covers the four routes on the exported subscriberPnlRouter:
 * GET /:id/pnl, GET /:id/equity, GET /:id/activity, GET /:id/trades
 * The aggregator, equity builder, activity service, and tenant isolator
 * are mocked so the routes' branching (auth, tenant access, parseRange,
 * validation, error paths) is exercised without a DB or real JWT.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const getSummaryMock = vi.hoisted(() => vi.fn());
const getDailyBreakdownMock = vi.hoisted(() => vi.fn());
const equityBuildMock = vi.hoisted(() => vi.fn());
const activityGetMetricsMock = vi.hoisted(() => vi.fn());
const assertTenantAccessMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../raas/subscriber-pnl-aggregator', () => ({
  SubscriberPnLAggregator: class {
    getSummary = getSummaryMock;
    getDailyBreakdown = getDailyBreakdownMock;
  },
}));

vi.mock('../../../raas/subscriber-equity-curve-builder', () => ({
  SubscriberEquityCurveBuilder: class {
    build = equityBuildMock;
  },
}));

vi.mock('../../../raas/subscriber-activity-metrics', () => ({
  SubscriberActivityMetricsService: class {
    getMetrics = activityGetMetricsMock;
  },
}));

vi.mock('../../../raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: assertTenantAccessMock,
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (req: Request, _res: Response, next: NextFunction) => {
    // Simulate license set by upstream raas-gate middleware
    req.license = { tier: 'PRO', subscriberId: 'sub-999' } as unknown;
    // Simulate claims set by auth middleware (used by extractTokenClaims)
    (req as Request & { claims?: { sub?: string; role?: string } }).claims = { sub: 'sub-999', role: 'user' };
    next();
  },
  requireFeature: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

import { subscriberPnlRouter } from '../subscriber-pnl-routes';

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(subscriberPnlRouter);
  return a;
}

// Mock data matches the token's subscriberId (sub-999)
const MOCK_SUMMARY = {
  subscriberId: 'sub-999',
  totalRealizedPnl: 1500.5,
  tradeCount: 42,
  winCount: 28,
  lossCount: 14,
  winRate: 0.6667,
  avgWin: 75.2,
  avgLoss: -45.8,
  bestTrade: 500,
  worstTrade: -200,
  profitFactor: 1.85,
  blockedDlpCount: 3,
};

const MOCK_EQUITY_CURVE = [
  { timestamp: 1_700_000_000_000, equity: 10000 },
  { timestamp: 1_700_086_400_000, equity: 10150 },
  { timestamp: 1_700_172_800_000, equity: 10300 },
];

const MOCK_ACTIVITY = {
  subscriberId: 'sub-999',
  signalCount: 120,
  fillCount: 42,
  dlpBlockedCount: 3,
  avgSignalLatencyMs: 45,
  lastActivityAt: 1_700_000_000_000,
};

const MOCK_BREAKDOWN = [
  { date: '2026-01-01', netPnl: 150.5, tradeCount: 5, winRate: 0.6 },
  { date: '2026-01-02', netPnl: -25.0, tradeCount: 3, winRate: 0.33 },
];

describe('subscriberPnlRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSummaryMock.mockResolvedValue(MOCK_SUMMARY);
    getDailyBreakdownMock.mockResolvedValue(MOCK_BREAKDOWN);
    equityBuildMock.mockResolvedValue(MOCK_EQUITY_CURVE);
    activityGetMetricsMock.mockResolvedValue(MOCK_ACTIVITY);
    assertTenantAccessMock.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('requireTier gate', () => {
    it('allows requests when requireTier passes (mocked)', async () => {
      // The requireTier mock is set up to pass through with a PRO license
      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(MOCK_SUMMARY);
    });
  });

  describe('tenant access guard', () => {
    it('returns 403 when assertTenantAccess throws cross-tenant error', async () => {
      assertTenantAccessMock.mockImplementation(() => {
        throw new Error('TenantIsolator: cross-tenant access denied - token=sub-456 requested=sub-999');
      });

      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('TenantIsolator: cross-tenant access denied - token=sub-456 requested=sub-999');
      expect(getSummaryMock).not.toHaveBeenCalled();
    });

    it('returns 403 when assertTenantAccess throws no-subscriber-identity error', async () => {
      assertTenantAccessMock.mockImplementation(() => {
        throw new Error('TenantIsolator: no subscriber identity in token');
      });

      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('TenantIsolator: no subscriber identity in token');
    });

    it('allows access when token subscriberId matches param (sub-999)', async () => {
      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(MOCK_SUMMARY);
      expect(assertTenantAccessMock).toHaveBeenCalledWith('sub-999', 'sub-999', false);
      expect(getSummaryMock).toHaveBeenCalledWith('sub-999');
    });
  });

  describe('GET /:id/pnl', () => {
    it('returns the P&L summary', async () => {
      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(MOCK_SUMMARY);
      expect(getSummaryMock).toHaveBeenCalledWith('sub-999');
    });

    it('returns 500 when aggregator throws', async () => {
      getSummaryMock.mockRejectedValue(new Error('db down'));

      const res = await request(app()).get('/sub-999/pnl');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db down');
    });
  });

  describe('GET /:id/equity', () => {
    it('returns the equity curve with default 30-day range', async () => {
      const res = await request(app()).get('/sub-999/equity');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(MOCK_EQUITY_CURVE);
      expect(equityBuildMock).toHaveBeenCalledWith(
        'sub-999',
        expect.any(Number),
        expect.any(Number),
        10000,
      );
    });

    it('uses custom capital and rangeMs from query', async () => {
      const res = await request(app()).get('/sub-999/equity?capital=5000&rangeMs=86400000');

      expect(res.status).toBe(200);
      expect(equityBuildMock).toHaveBeenCalledWith(
        'sub-999',
        expect.any(Number),
        expect.any(Number),
        5000,
      );
    });

    it('returns 500 when equity builder throws', async () => {
      equityBuildMock.mockRejectedValue(new Error('equity failed'));

      const res = await request(app()).get('/sub-999/equity');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('equity failed');
    });
  });

  describe('GET /:id/activity', () => {
    it('returns activity metrics', async () => {
      const res = await request(app()).get('/sub-999/activity');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(MOCK_ACTIVITY);
      expect(activityGetMetricsMock).toHaveBeenCalledWith('sub-999');
    });

    it('returns 500 when activity service throws', async () => {
      activityGetMetricsMock.mockRejectedValue(new Error('activity failed'));

      const res = await request(app()).get('/sub-999/activity');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('activity failed');
    });
  });

  describe('GET /:id/trades — daily P&L breakdown', () => {
    it('returns daily breakdown with default 30-day range', async () => {
      const res = await request(app()).get('/sub-999/trades');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subscriberId: 'sub-999', breakdown: MOCK_BREAKDOWN });
      expect(getDailyBreakdownMock).toHaveBeenCalledWith('sub-999', expect.any(Number), expect.any(Number));
    });

    it('forwards custom rangeMs to the aggregator', async () => {
      const res = await request(app()).get('/sub-999/trades?rangeMs=172800000');

      expect(res.status).toBe(200);
      expect(getDailyBreakdownMock).toHaveBeenCalledWith('sub-999', expect.any(Number), expect.any(Number));
      // Verify rangeMs actually affects the fromMs calculation
      const callArgs = getDailyBreakdownMock.mock.calls[0];
      const [_, fromMs, toMs] = callArgs;
      expect(toMs - fromMs).toBeCloseTo(172800000, -2); // ~2 days range
    });

    it('returns 500 when aggregator throws', async () => {
      getDailyBreakdownMock.mockRejectedValue(new Error('breakdown failed'));

      const res = await request(app()).get('/sub-999/trades');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('breakdown failed');
    });
  });
});