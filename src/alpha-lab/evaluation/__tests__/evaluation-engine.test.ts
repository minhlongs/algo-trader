import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluation-engine';
import type { EvaluateInput } from '../evaluation-engine';
import type { CandleLike } from '../regimes/regime-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';

function makeCandles(n = 50): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

function makeTrade(i: number, pnl: number): { timestamp: string; tokenId: string; side: 'BUY'; price: number; size: number; pnl: number } {
  return {
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    tokenId: '',
    side: 'BUY',
    price: 100 + i,
    size: 1,
    pnl,
  };
}

function makeLabels(pnls: number[]): Array<{ label: 1 | -1 | 0 } & { entryIdx: number }> {
  return pnls.map((p, i) => ({
    label: p > 0 ? 1 : p < 0 ? -1 : 0,
    entryIdx: i,
  }));
}

const baseInput = (pnls: number[]): EvaluateInput => {
  const candles = makeCandles(60);
  const trades = pnls.map((p, i) => makeTrade(i, p));
  const labels = makeLabels(pnls);
  const regimesPerBar = candles.map(() => 'TREND_UP' as const);
  return {
    candles,
    trades: trades as never[],
    labels,
    steps: [{ step: 0, train: { step: 0, startIdx: 0, endIdx: 30 } as never, val: { step: 0, startIdx: 30, endIdx: 45 } as never, test: { step: 0, startIdx: 45, endIdx: 60 } as never }],
    regimesPerBar,
  };
};

describe('Evaluation Engine', () => {
  it('returns zeroed report on empty trades', () => {
    const input: EvaluateInput = {
      candles: makeCandles(50),
      trades: [],
      labels: [],
      steps: [],
      regimesPerBar: [],
    };
    const report = evaluate(input);
    expect(report.overall.totalTrades).toBe(0);
    expect(report.byRegime).toEqual([]);
    expect(report.byMonth).toEqual([]);
    expect(report.byVolatilityBucket.length).toBe(0);
  });

  it('computes overall metrics with mixed PnL', () => {
    const pnls = [10, -5, 15, -3, 8];
    const report = evaluate(baseInput(pnls));
    expect(report.overall.totalTrades).toBe(5);
    expect(report.overall.winningTrades).toBe(3);
    expect(report.overall.losingTrades).toBe(2);
    expect(report.overall.winRate).toBeCloseTo(0.6, 1);
    expect(report.overall.totalNetPnl).toBeCloseTo(25, 1);
  });

  it('breaks down by regime', () => {
    const pnls = [10, -5, 15];
    const candles = makeCandles(60);
    const regimesPerBar: MarketRegime[] = ['TREND_UP', 'TREND_DOWN', 'RANGE'];
    const input: EvaluateInput = {
      candles,
      trades: pnls.map((p, i) => makeTrade(i, p)) as never[],
      labels: makeLabels(pnls),
      steps: [{ step: 0, train: { step: 0, startIdx: 0, endIdx: 30 } as never, val: { step: 0, startIdx: 30, endIdx: 45 } as never, test: { step: 0, startIdx: 45, endIdx: 60 } as never }],
      regimesPerBar,
    };
    const report = evaluate(input);
    expect(report.byRegime.length).toBeGreaterThan(0);
    const trUp = report.byRegime.find((r) => r.regime === 'TREND_UP');
    expect(trUp).toBeDefined();
    expect(trUp!.numTrades).toBeGreaterThan(0);
  });

  it('breaks down by calendar month', () => {
    const pnls = [10, -5];
    const report = evaluate(baseInput(pnls));
    expect(report.byMonth.length).toBeGreaterThan(0);
    const jan = report.byMonth.find((m) => m.month === '2025-01');
    expect(jan).toBeDefined();
    expect(jan!.numTrades).toBeGreaterThan(0);
  });

  it('assigns trades to a volatility bucket', () => {
    const pnls = [10, -5, 15];
    const report = evaluate(baseInput(pnls));
    expect(report.byVolatilityBucket.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(report.byVolatilityBucket[0]!.bucket);
  });

  it('is reproducible for same input', () => {
    const pnls = [10, -5, 15, -3, 8];
    const input = baseInput(pnls);
    const r1 = evaluate(input);
    const r2 = evaluate(input);
    expect(r1.overall.totalNetPnl).toBe(r2.overall.totalNetPnl);
    expect(r1.byRegime.length).toBe(r2.byRegime.length);
  });
});