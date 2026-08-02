/**
 * Marketplace Strategy Insights Routes — Integration Tests
 *
 * Tests: POST /:id/backtest, GET /:id/backtests, GET /:id/performance, GET /:id/reviews
 * Services are mocked — this tests route glue: validation, auth, response shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoist mocks BEFORE any module imports
const mocks = vi.hoisted(() => ({
  getStrategyWithDetails: vi.fn(),
  dbQuery: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('crypto', () => ({
  randomUUID: () => mocks.randomUUID(),
}));

// Mock BacktestRunner static run()
const mockBacktestRun = vi.fn();
vi.mock('../../../../shared/backtesting/backtest-runner', () => ({
  BacktestRunner: { run: (...args: any[]) => mockBacktestRun(...args) },
}));

// Mock getDbClient for persistence
vi.mock('../../../../db/postgres-client', () => ({
  getDbClient: () => ({ query: mocks.dbQuery }),
}));

vi.mock('../../../marketplace/services/marketplace.service', () => ({
  MarketplaceService: {
    getInstance: () => ({
      getStrategyWithDetails: mocks.getStrategyWithDetails,
    }),
  },
}));

import { marketplaceStrategyInsightsRouter } from '../marketplace-strategy-insights-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { id: 'tenant_001' };
    req.user = { id: 'user_001', tenantId: 'tenant_001' };
    next();
  });
  app.use('/', marketplaceStrategyInsightsRouter);
  return app;
}

const VALID_TRADES = [
  { entryTimestamp: 1700000000000, exitTimestamp: 1700003600000, pnlUsd: 50, entryPrice: 0.5, exitPrice: 0.55, size: 100, side: 'buy' as const },
  { entryTimestamp: 1700007200000, exitTimestamp: 1700010800000, pnlUsd: -20, entryPrice: 0.6, exitPrice: 0.58, size: 100, side: 'buy' as const },
];

const MOCK_BACKTEST_RESULT = {
  sharpeRatio: 1.85, maxDrawdown: 0.12, winRate: 0.6, totalPnlUsd: 30,
  profitFactor: 2.5, totalTrades: 2, winningTrades: 1, losingTrades: 1,
  avgWinUsd: 50, avgLossUsd: 20, volatilityAnnual: 0.25, equityCurve: [10000, 10050, 10030],
  finalEquity: 10030, maxEquity: 10050, minEquity: 10000, totalReturn: 0.003,
};

const FAKE_STRATEGY = {
  strategy: { id: 'strat_001', tenantId: 'tenant_001', name: 'test-strategy' },
  performance: { sharpeRatio: 1.5, totalTrades: 100 },
  reviews: [{ id: 'rev_001', rating: 4, comment: 'Good strategy', createdAt: '2026-06-01T00:00:00Z' }],
};

describe('POST /:id/backtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStrategyWithDetails.mockResolvedValue(FAKE_STRATEGY);
    mocks.randomUUID.mockReturnValue('backtest-uuid-001');
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    mockBacktestRun.mockReturnValue(MOCK_BACKTEST_RESULT);
  });

  it('returns 201 with backtest result for valid trades', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/strat_001/backtest')
      .send({ trades: VALID_TRADES });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('backtest-uuid-001');
    expect(res.body.sharpeRatio).toBe(1.85);
    expect(res.body.totalTrades).toBe(2);
    expect(mockBacktestRun).toHaveBeenCalledWith(VALID_TRADES, undefined);
  });

  it('returns 400 when trades array is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/strat_001/backtest')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when trades array is empty', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/strat_001/backtest')
      .send({ trades: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when trade is missing required numeric fields', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/strat_001/backtest')
      .send({ trades: [{ entryTimestamp: 123, pnlUsd: 10, entryPrice: 0.5, exitPrice: 0.6 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Each trade must have');
  });

  it('returns 404 when strategy does not exist', async () => {
    mocks.getStrategyWithDetails.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post('/nonexistent/backtest')
      .send({ trades: VALID_TRADES });

    expect(res.status).toBe(404);
  });

  it('passes config to BacktestRunner.run when provided', async () => {
    const app = buildApp();
    const config = { initialCapitalUsd: 5000, riskFreeRateAnnual: 0.03 };
    await request(app)
      .post('/strat_001/backtest')
      .send({ trades: VALID_TRADES, config });

    expect(mockBacktestRun).toHaveBeenCalledWith(VALID_TRADES, config);
  });

  it('persists backtest result to marketplace_backtests table', async () => {
    const app = buildApp();
    await request(app)
      .post('/strat_001/backtest')
      .send({ trades: VALID_TRADES });

    const insertCall = mocks.dbQuery.mock.calls.find(
      (call: any[]) => call[0]?.includes?.('INSERT INTO marketplace_backtests'),
    );
    expect(insertCall).toBeDefined();
  });
});

describe('GET /:id/backtests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStrategyWithDetails.mockResolvedValue(FAKE_STRATEGY);
    mocks.dbQuery.mockResolvedValue({
      rows: [
        { id: 'bt_001', sharpe_ratio: 1.5, max_drawdown: 0.1, win_rate: 0.55,
          total_pnl_usd: 200, profit_factor: 2.0, total_trades: 10, winning_trades: 6,
          losing_trades: 4, volatility: 0.2, total_return: 0.05, created_at: '2026-07-01T00:00:00Z' },
        { id: 'bt_002', sharpe_ratio: 1.8, max_drawdown: 0.08, win_rate: 0.6,
          total_pnl_usd: 350, profit_factor: 2.8, total_trades: 15, winning_trades: 9,
          losing_trades: 6, volatility: 0.18, total_return: 0.07, created_at: '2026-06-30T00:00:00Z' },
      ],
    });
  });

  it('returns backtest list mapped to camelCase', async () => {
    const app = buildApp();
    const res = await request(app).get('/strat_001/backtests');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      id: 'bt_001',
      sharpeRatio: 1.5,
      maxDrawdown: 0.1,
      winRate: 0.55,
    });
  });

  it('respects limit query parameter', async () => {
    const app = buildApp();
    await request(app).get('/strat_001/backtests?limit=1');

    const selectCall = mocks.dbQuery.mock.calls.find(
      (call: any[]) => call[0]?.includes?.('SELECT'),
    );
    expect(selectCall?.[1]?.[1]).toBe(1);
  });
});

describe('GET /:id/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbQuery.mockResolvedValue({ rows: [] });
  });

  it('returns 200 with performance data', async () => {
    mocks.getStrategyWithDetails.mockResolvedValue(FAKE_STRATEGY);
    const app = buildApp();
    const res = await request(app).get('/strat_001/performance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sharpeRatio: 1.5, totalTrades: 100 });
  });

  it('returns 404 when performance not found', async () => {
    mocks.getStrategyWithDetails.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).get('/nonexistent/performance');

    expect(res.status).toBe(404);
  });
});

describe('GET /:id/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbQuery.mockResolvedValue({ rows: [] });
  });

  it('returns 200 with paginated reviews', async () => {
    mocks.getStrategyWithDetails.mockResolvedValue(FAKE_STRATEGY);
    const app = buildApp();
    const res = await request(app).get('/strat_001/reviews');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.data[0].id).toBe('rev_001');
  });

  it('returns 404 when strategy not found', async () => {
    mocks.getStrategyWithDetails.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).get('/nonexistent/reviews');

    expect(res.status).toBe(404);
  });
});
