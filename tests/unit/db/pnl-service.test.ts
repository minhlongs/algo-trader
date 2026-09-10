/**
 * PnL Service Tests
 * Covers: constructor (default + injected repo), getDailySummary (data/empty/no-profit/no-loss),
 * getPerformanceMetrics, getTradeStats (zero trades), calculateSharpeRatio (<2days/zero-variance),
 * calculateMaxDrawdown (empty/negative/positive cumulative), saveDailySummary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockGetTotalPnl = vi.fn().mockResolvedValue(0);
const mockGetPnlByDateRange = vi.fn().mockResolvedValue([]);

vi.mock('../../../src/db/postgres-client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../../src/db/trade-repository', () => ({
  TradeRepository: vi.fn().mockImplementation(function () {
    return {
      getTotalPnl: (...args: unknown[]) => mockGetTotalPnl(...args),
      getPnlByDateRange: (...args: unknown[]) => mockGetPnlByDateRange(...args),
    };
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PnLService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates with default TradeRepository', async () => {
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      expect(service).toBeDefined();
    });

    it('creates with injected TradeRepository', async () => {
      const { PnLService } = await import('../../../src/db/pnl-service');
      const mockRepo = { getTotalPnl: mockGetTotalPnl, getPnlByDateRange: mockGetPnlByDateRange } as any;
      const service = new PnLService(mockRepo);
      expect(service).toBeDefined();
    });
  });

  describe('getDailySummary', () => {
    it('calculates summary with trade data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          trade_count: '10', total_profit: '50.0', total_loss: '20.0',
          net_pnl: '30.0', win_count: '6', loss_count: '4',
          avg_win: '8.33', avg_loss: '5.0',
        }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const summary = await service.getDailySummary(new Date());
      expect(summary.tradeCount).toBe(10);
      expect(summary.winRate).toBe(0.6);
      expect(summary.netPnl).toBe(30);
      expect(summary.totalProfit).toBe(50);
      expect(summary.totalLoss).toBe(20);
      expect(summary.avgWin).toBe(8.33);
      expect(summary.avgLoss).toBe(5);
      expect(summary.profitFactor).toBe(2.5);
    });

    it('returns defaults when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const summary = await service.getDailySummary(new Date());
      expect(summary.tradeCount).toBe(0);
      expect(summary.winRate).toBe(0);
      expect(summary.totalProfit).toBe(0);
      expect(summary.profitFactor).toBe(Infinity);
    });

    it('returns Infinity profitFactor when no losses', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          trade_count: '3', total_profit: '15.0', total_loss: '0.0',
          net_pnl: '15.0', win_count: '3', loss_count: '0',
          avg_win: '5.0', avg_loss: null,
        }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const summary = await service.getDailySummary(new Date());
      expect(summary.profitFactor).toBe(Infinity);
      expect(summary.lossCount).toBe(0);
    });

    it('returns 0 winRate when zero trades', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          trade_count: '0', total_profit: null, total_loss: null,
          net_pnl: null, win_count: '0', loss_count: '0',
          avg_win: null, avg_loss: null,
        }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const summary = await service.getDailySummary(new Date());
      expect(summary.winRate).toBe(0);
      expect(summary.totalProfit).toBe(0);
      expect(summary.totalLoss).toBe(0);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('computes metrics from repository data', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(100);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([{ profit: 10 }])
        .mockResolvedValueOnce([{ profit: 5 }, { profit: -2 }])
        .mockResolvedValueOnce([{ profit: 20 }, { profit: -5 }]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '100', wins: '55', avg_trade: '1.0', best_trade: '50.0', worst_trade: '-20.0' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.totalPnl).toBe(100);
      expect(metrics.dailyPnl).toBe(10);
      expect(metrics.weeklyPnl).toBe(3);
      expect(metrics.monthlyPnl).toBe(15);
      expect(metrics.winRate).toBe(0.55);
      expect(metrics.avgTrade).toBe(1);
      expect(metrics.bestTrade).toBe(50);
      expect(metrics.worstTrade).toBe(-20);
    });

    it('returns zero winRate when no trades', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0', wins: '0', avg_trade: '0', best_trade: '0', worst_trade: '0' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.winRate).toBe(0);
      expect(metrics.sharpeRatio).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('returns 0 when less than 2 days', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profit: 10 }]); // only 1 day
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '1', wins: '1', avg_trade: '10', best_trade: '10', worst_trade: '10' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.sharpeRatio).toBe(0);
    });

    it('returns 0 when all returns are identical (zero variance)', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profit: 5 }, { profit: 5 }, { profit: 5 }]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '3', wins: '3', avg_trade: '5', best_trade: '5', worst_trade: '5' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.sharpeRatio).toBe(0);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('returns 0 for empty array', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0', wins: '0', avg_trade: '0', best_trade: '0', worst_trade: '0' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.maxDrawdown).toBe(0);
    });

    it('computes max drawdown for declining series', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profit: 10 }, { profit: -5 }, { profit: -8 }, { profit: 3 }]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '4', wins: '2', avg_trade: '0', best_trade: '10', worst_trade: '-8' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.maxDrawdown).toBeGreaterThan(0);
    });

    it('returns 0 when cumulative is always positive', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profit: 5 }, { profit: 3 }, { profit: 2 }]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '3', wins: '3', avg_trade: '3.33', best_trade: '5', worst_trade: '2' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.maxDrawdown).toBe(0);
    });
  });

  describe('getTradeStats (via getPerformanceMetrics)', () => {
    it('falls back to zero when stats row has null values', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: null, wins: null, avg_trade: null, best_trade: null, worst_trade: null }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.winRate).toBe(0);
      expect(metrics.avgTrade).toBe(0);
      expect(metrics.bestTrade).toBe(0);
      expect(metrics.worstTrade).toBe(0);
    });
  });

  describe('calculateMaxDrawdown (via getPerformanceMetrics)', () => {
    it('keeps peak at zero when cumulative never exceeds zero', async () => {
      mockGetTotalPnl.mockResolvedValueOnce(0);
      mockGetPnlByDateRange
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ profit: -5 }, { profit: -3 }]);
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '2', wins: '0', avg_trade: '-4', best_trade: '-3', worst_trade: '-5' }],
      });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      const metrics = await service.getPerformanceMetrics();
      expect(metrics.maxDrawdown).toBe(0);
    });
  });

  describe('saveDailySummary', () => {
    it('inserts daily summary to database', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            trade_count: '5', total_profit: '25.0', total_loss: '10.0',
            net_pnl: '15.0', win_count: '3', loss_count: '2',
            avg_win: '8.33', avg_loss: '5.0',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const { PnLService } = await import('../../../src/db/pnl-service');
      const service = new PnLService();
      await service.saveDailySummary(new Date());
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO pnl_daily');
    });
  });
});
