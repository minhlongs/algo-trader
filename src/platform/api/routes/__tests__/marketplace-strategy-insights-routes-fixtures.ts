/**
 * Marketplace Strategy Insights Routes — Shared Fixtures
 * Exports: mocks, mockBacktestRun, buildApp, VALID_TRADES, MOCK_BACKTEST_RESULT, FAKE_STRATEGY
 */
import { vi, type Mock } from 'vitest';
import express from 'express';

const mocks = vi.hoisted(() => ({
  getStrategyWithDetails: vi.fn<Mock>(),
  dbQuery: vi.fn<Mock>(),
  randomUUID: vi.fn<Mock>(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('crypto', () => ({
  randomUUID: () => mocks.randomUUID(),
}));

const mockBacktestRun: Mock<(...args: unknown[]) => unknown> = vi.fn();
vi.mock('../../../../shared/backtesting/backtest-runner', () => ({
  BacktestRunner: { run: (...args: unknown[]) => mockBacktestRun(...args) },
}));

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

import { marketplaceStrategyInsightsRouter } from '../marketplace-strategy-insights-routes.js';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Record<string, unknown>, _res, next) => {
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

export { mocks, mockBacktestRun, buildApp, VALID_TRADES, MOCK_BACKTEST_RESULT, FAKE_STRATEGY };
