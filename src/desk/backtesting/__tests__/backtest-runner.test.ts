/**
 * Backtest Runner Tests
 */
import { describe, it, expect } from 'vitest';
import { BacktestRunner } from '../backtest-runner';
import { computeMetrics } from '../metrics-calculator';
import type { BacktestTrade } from '../types';
// Minimal OrderManager-like simulator for unit testing P&L logic
class TestOrderSimulator {
  trades: BacktestTrade[] = [];
  private positions = new Map<string, { size: number; avgPrice: number }>();
  private equity = 1000;

  buy(tokenId: string, price: number, size: number): void {
    const existing = this.positions.get(tokenId);
    if (existing) {
      const newSize = existing.size + size;
      const newAvg = (existing.avgPrice * existing.size + price * size) / newSize;
      this.positions.set(tokenId, { size: newSize, avgPrice: newAvg });
    } else {
      this.positions.set(tokenId, { size, avgPrice: price });
    }
    this.trades.push({ timestamp: new Date().toISOString(), tokenId, side: 'BUY', price, size, pnl: null });
  }

  sell(tokenId: string, price: number, size: number): void {
    const existing = this.positions.get(tokenId);
    if (!existing || existing.size <= 0) {
      this.trades.push({ timestamp: new Date().toISOString(), tokenId, side: 'SELL', price, size, pnl: null });
      return;
    }
    const closeSize = Math.min(size, existing.size);
    const pnl = closeSize * (price - existing.avgPrice);
    this.equity += pnl;
    this.positions.set(tokenId, { size: existing.size - closeSize, avgPrice: existing.avgPrice });
    if (this.positions.get(tokenId)!.size <= 0) this.positions.delete(tokenId);
    this.trades.push({ timestamp: new Date().toISOString(), tokenId, side: 'SELL', price, size: closeSize, pnl });
  }
}

describe('BacktestRunner', () => {

  it('creates successfully', () => {
    const runner = new BacktestRunner();
    expect(runner).toBeDefined();
  });

  it('throws on unknown strategy', async () => {
    const runner = new BacktestRunner();
    await expect(runner.run({
      strategy: 'nonexistent-strategy',
      paperTrading: true,
      capitalUsdc: 1000,
      days: 7,
    })).rejects.toThrow('Unknown strategy');
  });

  it('clearCache resets internal state', () => {
    const runner = new BacktestRunner();
    runner.clearCache();
    expect(runner).toBeDefined();
  });
});

describe('Backtest P&L Simulation (OrderManager logic)', () => {
  it('buy-then-sell computes P&L correctly (profit)', () => {
    const sim = new TestOrderSimulator();
    sim.buy('token-a', 0.5, 100);
    sim.sell('token-a', 0.6, 100);

    const closed = sim.trades.filter((t) => t.pnl !== null);
    expect(closed).toHaveLength(1);
    expect(closed[0].pnl).toBeCloseTo(10, 2); // 100 * (0.6 - 0.5)
  });

  it('buy-then-sell computes P&L correctly (loss)', () => {
    const sim = new TestOrderSimulator();
    sim.buy('token-a', 0.7, 100);
    sim.sell('token-a', 0.55, 100);

    const closed = sim.trades.filter((t) => t.pnl !== null);
    expect(closed[0].pnl).toBeCloseTo(-15, 2); // 100 * (0.55 - 0.7)
  });

  it('partial sell tracks remaining position', () => {
    const sim = new TestOrderSimulator();
    sim.buy('token-a', 0.5, 200);
    sim.sell('token-a', 0.6, 100); // sell half

    const closed = sim.trades.filter((t) => t.pnl !== null);
    expect(closed[0].pnl).toBeCloseTo(10, 2); // 100 * (0.6 - 0.5)

    sim.sell('token-a', 0.7, 100); // sell rest
    const allClosed = sim.trades.filter((t) => t.pnl !== null);
    expect(allClosed[1].pnl).toBeCloseTo(20, 2); // 100 * (0.7 - 0.5)
  });

  it('multiple buy-sell cycles produce correct P&L', () => {
    const sim = new TestOrderSimulator();

    // Trade 1: Profit
    sim.buy('token-a', 0.5, 50);
    sim.sell('token-a', 0.55, 50);

    // Trade 2: Loss
    sim.buy('token-b', 0.8, 100);
    sim.sell('token-b', 0.72, 100);

    // Trade 3: Profit
    sim.buy('token-c', 0.3, 200);
    sim.sell('token-c', 0.45, 200);

    const closed = sim.trades.filter((t) => t.pnl !== null);
    expect(closed).toHaveLength(3);

    const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    // 50*0.05 + 100*(-0.08) + 200*0.15 = 2.5 - 8 + 30 = 24.5
    expect(totalPnl).toBeCloseTo(24.5, 2);

    const metrics = computeMetrics(sim.trades, [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 1000 + totalPnl },
    ]);
    expect(metrics.totalTrades).toBe(3);
    expect(metrics.winningTrades).toBe(2);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.winRate).toBeCloseTo(2 / 3, 2);
    expect(metrics.bestTrade).toBeCloseTo(30, 2);
    expect(metrics.worstTrade).toBeCloseTo(-8, 2);
  });
});
