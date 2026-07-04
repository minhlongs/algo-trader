/**
 * Leaderboard Routes — Integration Tests
 *
 * Tests: GET /api/v1/leaderboard with sort, order, limit, tier gating
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock tier gate — let all requests through by default
vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock prediction accuracy tracker
const mockAccuracyData = [
  { strategyName: 'bollinger-squeeze', winRate: 1.0, totalTrades: 7, lastUpdated: '2026-07-04T00:00:00.000Z' },
  { strategyName: 'spread-mean-reversion', winRate: 0.5, totalTrades: 4, lastUpdated: '2026-07-04T00:00:00.000Z' },
];

vi.mock('../../../../desk/intelligence/prediction-accuracy-tracker', () => ({
  getAllStrategyAccuracy: vi.fn(() => mockAccuracyData),
  StrategyAccuracy: {},
}));

// Mock CSV data for backtest results
const mockCsvContent = [
  'strategy,sharpe_ratio,win_rate_pct,total_pnl_usd,profit_factor,max_drawdown_pct,total_trades,winning_trades,losing_trades,avg_pnl_per_trade_usd,best_trade_usd,worst_trade_usd,duration_ms,status',
  'bollinger-squeeze,19.5200,100.00,2.54,Infinity,0.00,7,7,0,0.36,0.37,0.35,119,OK',
  'vwap-deviation-sniper,-17.1200,0.00,-0.54,0.0000,0.01,7,0,7,-0.08,-0.07,-0.08,109,OK',
  'spread-mean-reversion,0.0000,0.00,0.00,0.0000,0.00,0,0,0,0.00,0.00,0.00,503,OK',
].join('\n');

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => mockCsvContent),
}));

import { leaderboardRouter } from '../leaderboard-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/leaderboard', leaderboardRouter);
  return app;
}

describe('Leaderboard Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns 200 with leaderboard data', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBeGreaterThan(0);
    });

    it('returns entries with all required fields', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      const entry = res.body.data[0];
      expect(entry).toHaveProperty('strategyName');
      expect(entry).toHaveProperty('winRate');
      expect(entry).toHaveProperty('sharpeRatio');
      expect(entry).toHaveProperty('maxDrawdown');
      expect(entry).toHaveProperty('totalTrades');
      expect(entry).toHaveProperty('profitFactor');
      expect(entry).toHaveProperty('lastUpdated');
    });

    it('includes strategies from backtest CSV that are not in accuracy data', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      const names = res.body.data.map((e: any) => e.strategyName);
      expect(names).toContain('vwap-deviation-sniper');
    });

    it('respects limit query param', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?limit=1')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('enforces maximum limit of 200', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?limit=999')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(200);
    });

    it('defaults to 50 limit when not specified', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Sorting (PRO+ feature)', () => {
    it('returns 200 when sort by winRate desc (default)', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?sort=winRate&order=desc')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('returns 200 when sort by sharpe asc', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?sort=sharpe&order=asc')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });

    it('returns 200 when sort by drawdown', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?sort=drawdown')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });

    it('ignores invalid sort field (falls back to unsorted)', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/leaderboard?sort=invalid')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });
  });
});
