import { describe, it, expect } from 'vitest';
import { evaluate, realizedVol, volBucket } from '../../../../src/alpha-lab/evaluation/evaluation-engine';
import type { EvaluateInput } from '../../../../src/alpha-lab/evaluation/evaluation-engine';
import type { CandleLike, MarketRegime } from '../../../../src/alpha-lab/regimes/regime-types';

function makeCandles(n = 50, priceFn?: (i: number) => number): CandleLike[] {
  return Array.from({ length: n }, (_, i) => {
    const close = priceFn ? priceFn(i) : 100 + i;
    return {
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 50 + i,
    };
  });
}

function makeTrade(
  i: number,
  pnl: number,
  month = 0,
): { timestamp: string; tokenId: string; side: 'BUY'; price: number; size: number; pnl: number } {
  return {
    timestamp: new Date(Date.UTC(2025, month, i + 1)).toISOString(),
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

  it('breaks down by calendar month and sorts chronologically', () => {
    const trades = [
      makeTrade(0, 10, 2), // March 2025
      makeTrade(1, -5, 0), // January 2025
      makeTrade(2, 20, 1), // February 2025
    ];
    const candles = makeCandles(60);
    const input: EvaluateInput = {
      candles,
      trades: trades as never[],
      labels: [
        { label: 1, entryIdx: 0 },
        { label: -1, entryIdx: 1 },
        { label: 1, entryIdx: 2 },
      ],
      steps: [],
      regimesPerBar: candles.map(() => 'TREND_UP' as const),
    };
    const report = evaluate(input);
    expect(report.byMonth).toHaveLength(3);
    expect(report.byMonth[0]!.month).toBe('2025-01');
    expect(report.byMonth[1]!.month).toBe('2025-02');
    expect(report.byMonth[2]!.month).toBe('2025-03');
  });

  it('assigns trades to a volatility bucket', () => {
    const pnls = [10, -5, 15];
    const report = evaluate(baseInput(pnls));
    expect(report.byVolatilityBucket.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(report.byVolatilityBucket[0]!.bucket);
  });

  it('handles trades with zero PnL, missing labels, undefined pnl, and unknown regime fallback', () => {
    const trades = [
      makeTrade(0, 0, 0), // flat/break-even trade (pnl = 0)
      {
        timestamp: new Date(Date.UTC(2025, 0, 2)).toISOString(),
        tokenId: '',
        side: 'BUY' as const,
        price: 100,
        size: 1,
        pnl: undefined as unknown as number, // test undefined pnl fallback
      },
      makeTrade(2, -10, 0), // losing trade
    ];
    const candles = makeCandles(60);
    const input: EvaluateInput = {
      candles,
      trades: trades as never[],
      labels: [], // no labels provided, entryIdx falls back to 0
      steps: [],
      regimesPerBar: [], // no regime at index 0, falls back to UNKNOWN
    };
    const report = evaluate(input);
    expect(report.overall.totalTrades).toBe(3);
    expect(report.byRegime).toHaveLength(1);
    expect(report.byRegime[0]!.regime).toBe('UNKNOWN');
    expect(report.byVolatilityBucket).toHaveLength(1);
  });

  it('evaluates medium and high volatility datasets', () => {
    // Medium volatility (swings around 1.5-2%)
    const medCandles = makeCandles(30, (i) => (i % 2 === 0 ? 100 : 101.8));
    const medReport = evaluate({
      candles: medCandles,
      trades: [makeTrade(0, 5)] as never[],
      labels: [{ label: 1, entryIdx: 0 }],
      steps: [],
      regimesPerBar: medCandles.map(() => 'RANGE' as const),
    });
    expect(medReport.byVolatilityBucket[0]!.bucket).toBe('medium');

    // High volatility (swings of 10%)
    const highCandles = makeCandles(30, (i) => (i % 2 === 0 ? 90 : 110));
    const highReport = evaluate({
      candles: highCandles,
      trades: [makeTrade(0, 5)] as never[],
      labels: [{ label: 1, entryIdx: 0 }],
      steps: [],
      regimesPerBar: highCandles.map(() => 'RANGE' as const),
    });
    expect(highReport.byVolatilityBucket[0]!.bucket).toBe('high');
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

describe('realizedVol helper', () => {
  it('returns null when candle length is less than 2', () => {
    expect(realizedVol([])).toBeNull();
    expect(realizedVol(makeCandles(1))).toBeNull();
  });

  it('returns null when any close price is non-positive', () => {
    const candlesWithZero = [
      { timestamp: '2025-01-01', open: 100, high: 100, low: 100, close: 100, volume: 10 },
      { timestamp: '2025-01-02', open: 0, high: 0, low: 0, close: 0, volume: 10 },
    ];
    const candlesWithNegative = [
      { timestamp: '2025-01-01', open: 100, high: 100, low: 100, close: -10, volume: 10 },
      { timestamp: '2025-01-02', open: 100, high: 100, low: 100, close: 100, volume: 10 },
    ];
    expect(realizedVol(candlesWithZero)).toBeNull();
    expect(realizedVol(candlesWithNegative)).toBeNull();
  });

  it('computes positive realized volatility for fluctuating prices', () => {
    const candles = makeCandles(20, (i) => (i % 2 === 0 ? 100 : 105));
    const vol = realizedVol(candles);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
  });
});

describe('volBucket helper', () => {
  it('returns medium when vol is null', () => {
    expect(volBucket(null)).toBe('medium');
  });

  it('returns low when vol < 0.01', () => {
    expect(volBucket(0.005)).toBe('low');
  });

  it('returns high when vol > 0.03', () => {
    expect(volBucket(0.05)).toBe('high');
  });

  it('returns medium when vol is between 0.01 and 0.03 inclusive', () => {
    expect(volBucket(0.01)).toBe('medium');
    expect(volBucket(0.02)).toBe('medium');
    expect(volBucket(0.03)).toBe('medium');
  });
});
