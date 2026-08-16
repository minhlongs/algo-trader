import { describe, it, expect } from 'vitest';
import { runAllBaselines } from '../baseline-runner';
import type { CandleLike } from '../../regimes/regime-types';

function makeCandles(n: number): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

describe('runAllBaselines', () => {
  it('runs all 4 baselines', () => {
    const candles = makeCandles(120);
    const runs = runAllBaselines(candles);
    expect(runs).toHaveLength(4);
    const names = runs.map((r) => r.name);
    expect(names).toContain('buy-and-hold');
    expect(names).toContain('random-entry');
    expect(names).toContain('simple-momentum');
    expect(names).toContain('simple-mean-reversion');
  });

  it('is deterministic with same seed', () => {
    const candles = makeCandles(100);
    const r1 = runAllBaselines(candles, 5, 2, 7);
    const r2 = runAllBaselines(candles, 5, 2, 7);
    expect(r1.map((r) => r.report.totalPnl)).toEqual(r2.map((r) => r.report.totalPnl));
  });

  it('applies custom cost params', () => {
    const candles = makeCandles(50);
    const lowCost = runAllBaselines(candles, 1, 1, 42);
    const highCost = runAllBaselines(candles, 20, 20, 42);
    expect(lowCost[0]!.report.totalPnl).toBeGreaterThan(highCost[0]!.report.totalPnl);
  });

  it('returns metrics for each baseline', () => {
    const candles = makeCandles(80);
    const runs = runAllBaselines(candles);
    for (const r of runs) {
      expect(typeof r.report.totalPnl).toBe('number');
      expect(typeof r.report.winRate).toBe('number');
      expect(typeof r.report.totalTrades).toBe('number');
    }
  });
});