/**
 * Metrics Calculator Tests
 */
import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeProfitFactor,
} from '../metrics-calculator';
import type { BacktestTrade } from '../types';

describe('computeMaxDrawdown', () => {
  it('returns 0 for flat equity curve', () => {
    const curve = [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 1000 },
      { timestamp: 'c', equity: 1000 },
    ];
    expect(computeMaxDrawdown(curve)).toBe(0);
  });

  it('returns 0 for always-rising equity', () => {
    const curve = [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 1100 },
      { timestamp: 'c', equity: 1200 },
    ];
    expect(computeMaxDrawdown(curve)).toBe(0);
  });

  it('computes drawdown from peak', () => {
    const curve = [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 1200 }, // peak
      { timestamp: 'c', equity: 900 },  // -25% from peak
    ];
    expect(computeMaxDrawdown(curve)).toBeCloseTo(-0.25, 4);
  });

  it('returns 0 for single-point curve', () => {
    expect(computeMaxDrawdown([{ timestamp: 'a', equity: 500 }])).toBe(0);
  });

  it('tracks new peak after recovery', () => {
    const curve = [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 900 },  // -10%
      { timestamp: 'c', equity: 1100 }, // new peak
      { timestamp: 'd', equity: 990 },  // -10% from new peak
    ];
    expect(computeMaxDrawdown(curve)).toBeCloseTo(-0.1, 4);
  });
});

describe('computeSharpeRatio', () => {
  it('returns 0 for single-point curve', () => {
    expect(computeSharpeRatio([{ equity: 1000 }])).toBe(0);
  });

  it('returns 0 for flat equity', () => {
    const curve = [
      { timestamp: 'a', equity: 1000 },
      { timestamp: 'b', equity: 1000 },
      { timestamp: 'c', equity: 1000 },
    ];
    expect(computeSharpeRatio(curve)).toBe(0);
  });

  it('positive Sharpe for rising equity', () => {
    const curve: Array<{ equity: number }> = [];
    let e = 1000;
    for (let i = 0; i < 30; i++) {
      e += 10 + Math.random() * 5;
      curve.push({ equity: e });
    }
    const sharpe = computeSharpeRatio(curve);
    expect(sharpe).toBeGreaterThan(0);
  });
});

describe('computeProfitFactor', () => {
  it('returns 0 for no trades', () => {
    expect(computeProfitFactor([])).toBe(0);
  });

  it('Infinity when no losing trades', () => {
    const trades = [
      { pnl: 10 } as BacktestTrade,
      { pnl: 20 } as BacktestTrade,
    ];
    expect(computeProfitFactor(trades)).toBe(Infinity);
  });

  it('computes ratio correctly', () => {
    const trades = [
      { pnl: 100 } as BacktestTrade,
      { pnl: 50 } as BacktestTrade,
      { pnl: -30 } as BacktestTrade,
      { pnl: -20 } as BacktestTrade,
    ];
    // gross profit: 150, gross loss: 50, ratio: 3.0
    expect(computeProfitFactor(trades)).toBe(3.0);
  });
});

describe('computeMetrics', () => {
  it('aggregates full metrics report', () => {
    const trades: BacktestTrade[] = [
      { timestamp: 't1', tokenId: 'a', side: 'BUY', price: 0.5, size: 100, pnl: null },
      { timestamp: 't2', tokenId: 'a', side: 'SELL', price: 0.6, size: 100, pnl: 10 },
      { timestamp: 't3', tokenId: 'b', side: 'BUY', price: 0.4, size: 100, pnl: null },
      { timestamp: 't4', tokenId: 'b', side: 'SELL', price: 0.35, size: 100, pnl: -5 },
    ];
    const equity = [
      { timestamp: 't0', equity: 1000 },
      { timestamp: 't2', equity: 1010 },
      { timestamp: 't4', equity: 1005 },
    ];

    const metrics = computeMetrics(trades, equity);

    expect(metrics.totalTrades).toBe(2); // only closed trades
    expect(metrics.totalPnl).toBe(5);
    expect(metrics.winningTrades).toBe(1);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.bestTrade).toBe(10);
    expect(metrics.worstTrade).toBe(-5);
    expect(metrics.avgPnlPerTrade).toBe(2.5);
  });

  it('handles empty trades gracefully', () => {
    const result = computeMetrics([], [{ timestamp: 'a', equity: 1000 }]);
    expect(result.totalTrades).toBe(0);
    expect(result.totalPnl).toBe(0);
    expect(result.winRate).toBe(0);
  });
});
