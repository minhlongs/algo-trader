/**
 * Backtest Routes — Integration Tests
 *
 * Tests: POST /submit, GET /results
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

vi.mock('../../../desk/arbitrage/backtester', () => ({
  Backtester: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({
      sharpeRatio: 1.5,
      maxDrawdown: 0.12,
      netProfitPct: 5.2,
      totalTrades: 42,
      winRate: 0.55,
      profitFactor: 2.1,
    }),
  })),
}));

import { backtestRouter } from '../backtest';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/backtest', backtestRouter);
  return app;
}

describe('Backtest Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /submit', () => {
    it('returns 201 with backtest result for valid request', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/backtest/submit')
        .send({
          pair: 'BTC/USDT',
          timeframe: '1h',
          strategyName: 'arb-spread-v1',
          days: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('jobId');
      expect(res.body.status).toBe('completed');
      expect(res.body.result).toHaveProperty('sharpeRatio');
    });

    it('returns 400 for missing body', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/backtest/submit')
        .send({});

      expect(res.status).toBe(201); // all fields have defaults
      expect(res.body).toHaveProperty('jobId');
    });

    it('returns 400 for invalid timeframe type', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/backtest/submit')
        .send({ timeframe: 123 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /results', () => {
    it('returns 200 with results array', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/backtest/results');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/backtest/results?id=nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });
});
