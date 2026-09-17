/**
 * PaperExecutor Tests — Phase 22
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaperExecutor, resetPaperExecutor } from '../paper-executor';

describe('PaperExecutor', () => {
  let executor: PaperExecutor;

  beforeEach(() => {
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
      const buy = await executor.executePaperTrade(
        { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1 },
        50_000,
      );
      expect(buy.success).toBe(true);

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
