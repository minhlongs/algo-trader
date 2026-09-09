import { describe, it, expect } from 'vitest';
import { computeSplitMetrics } from '../split-metrics';
import type { CandleLike } from '../../regimes/regime-types';

function makeCandles(n = 10): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

describe('computeSplitMetrics', () => {
  it('returns default zeroed metrics with timeoutRate 1 when labels are empty', () => {
    const candles = makeCandles(10);
    const metrics = computeSplitMetrics({
      labels: [],
      trades: [],
      candles,
      regimesPresent: ['RANGE'],
      split: { startIdx: 0, endIdx: 10 },
    });

    expect(metrics).toEqual({
      numTrades: 0,
      winRate: 0,
      lossRate: 0,
      timeoutRate: 1,
      meanLabel: 0,
      regimesPresent: ['RANGE'],
      totalPnl: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    });
  });

  it('computes win, loss, and timeout rates correctly with non-empty labels', () => {
    const candles = makeCandles(10);
    const labels = [
      { label: 1 as const, exitIdx: 2, exitType: 'tp' as const, returnPct: 0.02, holdingBars: 2, entryIdx: 0 },
      { label: -1 as const, exitIdx: 4, exitType: 'sl' as const, returnPct: -0.01, holdingBars: 2, entryIdx: 2 },
      { label: 0 as const, exitIdx: 8, exitType: 'timeout' as const, returnPct: 0.005, holdingBars: 4, entryIdx: 4 },
      { label: 1 as const, exitIdx: 9, exitType: 'tp' as const, returnPct: 0.02, holdingBars: 3, entryIdx: 6 },
    ];
    const trades = [
      { timestamp: candles[2]!.timestamp, tokenId: '', side: 'BUY' as const, price: 102, size: 1, pnl: 0.02 },
      { timestamp: candles[4]!.timestamp, tokenId: '', side: 'BUY' as const, price: 99, size: 1, pnl: -0.01 },
      { timestamp: candles[8]!.timestamp, tokenId: '', side: 'BUY' as const, price: 100.5, size: 1, pnl: 0.005 },
      { timestamp: candles[9]!.timestamp, tokenId: '', side: 'BUY' as const, price: 102, size: 1, pnl: 0.02 },
    ];

    const metrics = computeSplitMetrics({
      labels,
      trades,
      candles,
      regimesPresent: ['TREND_UP'],
      split: { startIdx: 0, endIdx: 10 },
    });

    expect(metrics.numTrades).toBe(4);
    expect(metrics.winRate).toBe(0.5); // 2 / 4
    expect(metrics.lossRate).toBe(0.25); // 1 / 4
    expect(metrics.timeoutRate).toBe(0.25); // 1 / 4
    expect(metrics.meanLabel).toBe(0.25); // (1 - 1 + 0 + 1) / 4 = 1 / 4
    expect(metrics.regimesPresent).toEqual(['TREND_UP']);
    expect(typeof metrics.totalPnl).toBe('number');
  });
});
