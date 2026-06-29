/**
 * PaperPnlTracker Tests
 *
 * Phase 23 — Paper Trading P&L Tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaperPnlTracker } from '../paper-trading/paper-pnl-tracker';
import { PaperExecutor, resetPaperExecutor } from '../../execution/paper-executor';

function makeExecutorWithTrades(trades: Array<{ side: 'buy' | 'sell'; pnl?: number; timestamp: number }>): PaperExecutor {
  const executor = new PaperExecutor({ initialBalance: 10_000, simulateFillRate: 1.0 });
  // Use start() to initialize, then inject trades directly into internal state
  return executor as unknown as PaperExecutor;
}

describe('PaperPnlTracker', () => {
  let executor: PaperExecutor;

  beforeEach(() => {
 resetPaperExecutor();
    executor = new PaperExecutor({ initialBalance: 10_000, simulateFillRate: 1.0 });
  });

  describe('getSummary', () => {
    it('should return empty summary with no trades', async () => {
      await executor.start(undefined, true);
      const tracker = new PaperPnlTracker(executor);
      const summary = tracker.getSummary();
      expect(summary.allTime.tradeCount).toBe(0);
      expect(summary.allTime.pnl).toBe(0);
      expect(summary.daily).toHaveLength(0);
      expect(summary.weekly).toHaveLength(0);
      expect(summary.monthly).toHaveLength(0);
    });

    it('should categorize trades into daily periods', async () => {
      await executor.start(undefined, true);
      const now = Date.now();
      // Execute trades at known timestamps
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      const summary = tracker.getSummary();
      expect(summary.allTime.tradeCount).toBe(2);
      expect(summary.allTime.winCount).toBe(1);
      expect(summary.allTime.lossCount).toBe(0);
    });
  });

  describe('getToday', () => {
    it('should return today P&L', async () => {
      await executor.start(undefined, true);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      const today = tracker.getToday();
      expect(today.tradeCount).toBe(2);
      expect(today.pnl).toBeGreaterThan(0);
    });
  });

  describe('getThisWeek', () => {
    it('should return this week P&L', async () => {
      await executor.start(undefined, true);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      const week = tracker.getThisWeek();
      expect(week.tradeCount).toBe(2);
      expect(week.pnl).toBeGreaterThan(0);
    });
  });

  describe('exportPrometheus', () => {
    it('should return valid Prometheus text format', async () => {
      await executor.start(undefined, true);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      const prom = tracker.exportPrometheus();

      // Check HELP and TYPE lines
      expect(prom).toContain('# HELP paper_trading_balance');
      expect(prom).toContain('# TYPE paper_trading_balance gauge');
      expect(prom).toContain('# HELP paper_trading_win_rate');
      expect(prom).toContain('# TYPE paper_trading_win_rate gauge');
      expect(prom).toContain('# HELP paper_trading_sharpe_ratio');
      expect(prom).toContain('# TYPE paper_trading_sharpe_ratio gauge');
      expect(prom).toContain('# HELP paper_trading_max_drawdown');
      expect(prom).toContain('# TYPE paper_trading_max_drawdown gauge');
      expect(prom).toContain('# HELP paper_trading_daily_pnl');
      expect(prom).toContain('# HELP paper_trading_weekly_pnl');
      expect(prom).toContain('# HELP paper_trading_monthly_pnl');

      // Check metric values
      expect(prom).toContain('paper_trading_balance');
      expect(prom).toContain('paper_trading_equity');
      expect(prom).toContain('paper_trading_win_rate');
      expect(prom).toContain('paper_trading_total_trades');
      expect(prom).toContain('paper_trading_open_positions');
    });

    it('should include labels for period metrics', async () => {
      await executor.start(undefined, true);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      const prom = tracker.exportPrometheus();
      // Daily P&L should have period label
      expect(prom).toContain('paper_trading_daily_pnl{period="');
    });
  });

  describe('logReport', () => {
    it('should not throw when called', async () => {
      await executor.start(undefined, true);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000);
      await executor.executePaperTrade({ symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000);

      const tracker = new PaperPnlTracker(executor);
      expect(() => tracker.logReport()).not.toThrow();
    });
  });
});
