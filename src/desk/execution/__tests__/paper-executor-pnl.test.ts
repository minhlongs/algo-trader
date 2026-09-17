/**
 * PaperExecutor PnL Summary Tests
 *
 * Phase 22 — Paper Trading Executor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaperExecutor,
  resetPaperExecutor,
} from '../paper-executor';

describe('PaperExecutor - getPnlSummary', () => {
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
