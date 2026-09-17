/**
 * PaperExecutor Positions, TradeHistory & UpdatePrices Tests
 *
 * Self-contained sub-suite. Re-declares resetPaperExecutor and imports
 * so it can run independently of paper-executor.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaperExecutor,
  resetPaperExecutor,
} from '../paper-executor';

describe('PaperExecutor — positions, trade history & mark-to-market', () => {
  let executor: PaperExecutor;

  beforeEach(() => {
    resetPaperExecutor();
    executor = new PaperExecutor({
      initialBalance: 10_000,
      slippagePercent: 0.001,
      feePercent: 0.001,
      simulateFillRate: 1.0,
    });
  });

  describe('getPositions', () => {
    it('should return empty positions before any trades', async () => {
      await executor.start();
      expect(executor.getPositions()).toHaveLength(0);
    });

    it('should track open positions after buy', async () => {
      await executor.start();
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      const positions = executor.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]!.symbol).toBe('BTC/USDT');
      expect(positions[0]!.side).toBe('long');
      expect(positions[0]!.quantity).toBe(0.1);
      expect(positions[0]!.unrealizedPnl).toBe(0);
    });

    it('should remove position after full sell', async () => {
      await executor.start();
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 },
        55_000,
      );
      expect(executor.getPositions()).toHaveLength(0);
    });

    it('should return a copy (not the internal array)', async () => {
      await executor.start();
      const pos1 = executor.getPositions();
      const pos2 = executor.getPositions();
      expect(pos1).not.toBe(pos2);
    });
  });

  describe('getTradeHistory', () => {
    it('should return empty history initially', async () => {
      await executor.start();
      expect(executor.getTradeHistory()).toHaveLength(0);
    });

    it('should record trades in history', async () => {
      await executor.start();
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 },
        55_000,
      );
      const history = executor.getTradeHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.side).toBe('buy');
      expect(history[1]!.side).toBe('sell');
      expect(history[1]!.pnl).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      await executor.start();
      for (let i = 0; i < 10; i++) {
        await executor.executePaperTrade(
          { symbol: 'BTC/USDT', side: 'buy', quantity: 0.01 },
          50_000,
        );
      }
      expect(executor.getTradeHistory(3)).toHaveLength(3);
    });
  });

  describe('updatePrices', () => {
    it('should update mark-to-market prices', async () => {
      await executor.start();
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      const prices = new Map([['BTC/USDT', 60_000]]);
      const positions = executor.updatePrices(prices);
      expect(positions[0]!.currentPrice).toBe(60_000);
      expect(positions[0]!.unrealizedPnl).toBeCloseTo(1_000, -2);
    });

    it('should update equity after price update', async () => {
      await executor.start(10_000);
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      const prices = new Map([['BTC/USDT', 60_000]]);
      executor.updatePrices(prices);
      const summary = executor.getPnlSummary();
      expect(summary.equity).toBeGreaterThan(summary.balance);
    });
  });
});
