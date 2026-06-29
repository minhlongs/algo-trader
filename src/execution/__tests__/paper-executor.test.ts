/**
 * PaperExecutor Tests
 *
 * Phase 22 — Paper Trading Executor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaperExecutor,
  PaperTrade,
  PaperPosition,
  ExecutionResult,
  resetPaperExecutor,
} from '../paper-executor';

describe('PaperExecutor', () => {
  let executor: PaperExecutor;

  beforeEach(() => {
    // Reset singleton between tests
    // reset via imported function
    resetPaperExecutor();
    executor = new PaperExecutor({
      initialBalance: 10_000,
      slippagePercent: 0.001,
      feePercent: 0.001,
      simulateFillRate: 1.0, // always fill for deterministic tests
    });
  });

  describe('start / stop', () => {
    it('should start with default balance', async () => {
      const account = await executor.start();
      expect(account.balance).toBe(10_000);
      expect(account.equity).toBe(10_000);
      expect(account.totalTrades).toBe(0);
    });

    it('should start with custom balance', async () => {
      const account = await executor.start(5_000);
      expect(account.balance).toBe(5_000);
      expect(account.equity).toBe(5_000);
    });

    it('should stop without error', async () => {
      await executor.start();
      await expect(executor.stop()).resolves.toBeUndefined();
    });
  });

  describe('executePaperTrade', () => {
    it('should reject trades when not started', async () => {
      const result = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 1 },
        50_000,
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not started/);
    });

    it('should execute a buy trade', async () => {
      await executor.start();
      const result = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      expect(result.success).toBe(true);
      expect(result.trade).toBeDefined();
      expect(result.trade!.side).toBe('buy');
      expect(result.trade!.symbol).toBe('BTC/USDT');
      expect(result.trade!.quantity).toBe(0.1);
      expect(result.trade!.status).toBe('filled');
      // executed price should include slippage (buy higher)
      expect(result.trade!.executedPrice).toBeGreaterThan(50_000);
      expect(result.account).toBeDefined();
      expect(result.account!.balance).toBeLessThan(10_000);
    });

    it('should reject buy when insufficient balance', async () => {
      await executor.start(1_000);
      const result = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 1 },
        50_000,
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Insufficient balance/);
    });

    it('should reject sell when no position', async () => {
      await executor.start();
      const result = await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'sell', quantity: 1 },
        3_000,
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Insufficient position/);
    });

    it('should execute a full round-trip trade', async () => {
      await executor.start(10_000);
      // Buy
      const buy = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      expect(buy.success).toBe(true);

      // Sell at higher price
      const sell = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 },
        55_000,
      );
      expect(sell.success).toBe(true);
      expect(sell.trade!.pnl).toBeGreaterThan(0);
      expect(sell.account!.realizedPnl).toBeGreaterThan(0);
      expect(sell.account!.totalTrades).toBe(1);
      expect(sell.account!.winningTrades).toBe(1);
    });

    it('should track losing trade', async () => {
      await executor.start(10_000);
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      const sell = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 },
        45_000,
      );
      expect(sell.trade!.pnl).toBeLessThan(0);
      expect(sell.account!.losingTrades).toBe(1);
    });

    it('should reject when fill rate is 0', async () => {
      const noFillExecutor = new PaperExecutor({
        initialBalance: 10_000,
        simulateFillRate: 0,
      });
      await noFillExecutor.start();
      const result = await noFillExecutor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not filled/);
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

  describe('getPnlSummary', () => {
    it('should return zero summary with no trades', async () => {
      await executor.start();
      const summary = executor.getPnlSummary();
      expect(summary.totalPnl).toBe(0);
      expect(summary.winRate).toBe(0);
      expect(summary.totalTrades).toBe(0);
      expect(summary.balance).toBe(10_000);
      expect(summary.equity).toBe(10_000);
    });

    it('should calculate win rate correctly', async () => {
      await executor.start();
      // 3 wins
      for (let i = 0; i < 3; i++) {
        await executor.executePaperTrade(
          { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
          50_000,
        );
        await executor.executePaperTrade(
          { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 },
          55_000,
        );
      }
      // 1 loss
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'buy', quantity: 1 },
          3_000,
      );
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'sell', quantity: 1 },
          2_900,
      );

      const summary = executor.getPnlSummary();
      expect(summary.totalTrades).toBe(4);
      expect(summary.winningTrades).toBe(3);
      expect(summary.losingTrades).toBe(1);
      expect(summary.winRate).toBeCloseTo(75, 0);
    });

    it('should calculate profit factor', async () => {
      await executor.start();
      // Win
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000,
      );
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000,
      );
      // Loss
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'buy', quantity: 1 }, 3_000,
      );
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'sell', quantity: 1 }, 2_900,
      );

      const summary = executor.getPnlSummary();
      expect(summary.profitFactor).toBeGreaterThan(0);
      expect(summary.profitFactor).not.toBe(Infinity);
    });

    it('should calculate max drawdown', async () => {
      await executor.start();
      // Win
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000,
      );
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'sell', quantity: 0.1 }, 55_000,
      );
      // Big loss
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'buy', quantity: 2 }, 3_000,
      );
      await executor.executePaperTrade(
        { symbol: 'ETH/USDT', side: 'sell', quantity: 2 }, 2_500,
      );

      const summary = executor.getPnlSummary();
      expect(summary.maxDrawdown).toBeGreaterThan(0);
      expect(summary.maxDrawdown).toBeLessThan(1);
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
      expect(positions[0]!.unrealizedPnl).toBeCloseTo(1_000, -2); // (60k - 50k) * 0.1
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

  describe('reset', () => {
    it('should reset account to initial balance', async () => {
      await executor.start(10_000);
      await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 }, 50_000,
      );
      const account = await executor.reset(5_000);
      expect(account.balance).toBe(5_000);
      expect(account.equity).toBe(5_000);
      expect(executor.getPositions()).toHaveLength(0);
      expect(executor.getTradeHistory()).toHaveLength(0);
    });
  });
});
