/**
 * Paper Trading P&L Tracker — comprehensive tests.
 *
 * Covers: computeDailyPnl, computeMaxDrawdown, computeSharpeRatio,
 *         computePnlSnapshot, registerPaperTradingMetrics, updatePaperTradingMetrics.
 *
 * Mocks: prom-client (Gauge constructor + register), prometheus-metrics (register).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeDailyPnl,
  computeMaxDrawdown,
  computeSharpeRatio,
  computePnlSnapshot,
  registerPaperTradingMetrics,
  updatePaperTradingMetrics,
  type PnlSnapshot,
  type DailyPnl,
} from '../paper-trading-pnl-tracker';

// ─── Hoisted mocks (must be declared before vi.mock calls, which are hoisted) ─

const mockGaugeSet = vi.hoisted(() => vi.fn());
const mockGaugeCtor = vi.hoisted(() => vi.fn(function GaugeMock() { return { set: mockGaugeSet }; }));
const mockCounterCtor = vi.hoisted(() => vi.fn(function CounterMock() { return { inc: vi.fn() }; }));
const mockHistogramCtor = vi.hoisted(() => vi.fn(function HistogramMock() { return { observe: vi.fn() }; }));
const mockRegistryCtor = vi.hoisted(() =>
  vi.fn(function RegistryMock() {
    return {
      contentType: 'text/plain',
      metrics: vi.fn().mockResolvedValue(''),
    };
  }),
);

vi.mock('prom-client', () => ({
  default: {
    Gauge: mockGaugeCtor,
    Counter: mockCounterCtor,
    Histogram: mockHistogramCtor,
    Registry: mockRegistryCtor,
    collectDefaultMetrics: vi.fn(),
  },
}));

vi.mock('../platform/middleware/prometheus-metrics', () => ({
  register: {},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a PaperTrade with a given unix-ms timestamp. */
function makeTrade(
  overrides: Partial<{
    id: string;
    marketId: string;
    side: 'YES' | 'NO';
    size: number;
    entryPrice: number;
    strategy: string;
    source: string;
    signalConfidence: number;
    swarmApproved: boolean;
    aiValidated: boolean;
    timestamp: number;
  }> = {},
): PaperTrade & { exitPrice: number; pnl: number } {
  const ts = overrides.timestamp ?? Date.now();
  return {
    ...overrides,
    id: overrides.id ?? `trade-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    marketId: overrides.marketId ?? 'mkt-1',
    side: overrides.side ?? 'YES',
    size: overrides.size ?? 100,
    entryPrice: overrides.entryPrice ?? 0.5,
    strategy: overrides.strategy ?? 'qwen-test',
    source: overrides.source ?? 'qwen',
    signalConfidence: overrides.signalConfidence ?? 0.8,
    swarmApproved: overrides.swarmApproved ?? true,
    aiValidated: overrides.aiValidated ?? true,
    timestamp: ts,
    exitPrice: overrides.exitPrice ?? 0.6,
    pnl: overrides.pnl ?? 10,
  };
}

/** Build a PaperPortfolio from optional overrides. */
function makePortfolio(
  overrides: Partial<{
    capital: number;
    totalPnl: number;
    winCount: number;
    lossCount: number;
    positions: PaperTrade[];
    closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  }> = {},
): PaperPortfolio {
  return {
    capital: overrides.capital ?? 1000,
    totalPnl: overrides.totalPnl ?? 0,
    winCount: overrides.winCount ?? 0,
    lossCount: overrides.lossCount ?? 0,
    positions: overrides.positions ?? [],
    closedTrades: overrides.closedTrades ?? [],
  };
}

// ─── computeDailyPnl ──────────────────────────────────────────────────────────

describe('computeDailyPnl', () => {
  it('should return empty array for no trades', () => {
    expect(computeDailyPnl([])).toEqual([]);
  });

  it('should group a single trade into one day', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [makeTrade({ timestamp: ts, pnl: 15 })];
    const result = computeDailyPnl(trades);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: '2026-04-10',
      pnl: 15,
      trades: 1,
      wins: 1,
      losses: 0,
    });
  });

  it('should aggregate multiple trades on the same day', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: ts, pnl: 10 }),
      makeTrade({ timestamp: ts, pnl: 5 }),
      makeTrade({ timestamp: ts, pnl: -3 }),
    ];
    const result = computeDailyPnl(trades);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: '2026-04-10',
      pnl: 12, // 10 + 5 - 3
      trades: 3,
      wins: 2,
      losses: 1,
    });
  });

  it('should separate trades across multiple days', () => {
    const day1 = new Date('2026-04-10T10:00:00Z').getTime();
    const day2 = new Date('2026-04-11T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: day1, pnl: 10 }),
      makeTrade({ timestamp: day2, pnl: -5 }),
    ];
    const result = computeDailyPnl(trades);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-04-10');
    expect(result[0].pnl).toBe(10);
    expect(result[1].date).toBe('2026-04-11');
    expect(result[1].pnl).toBe(-5);
  });

  it('should sort results by date ascending', () => {
    const late = new Date('2026-04-15T10:00:00Z').getTime();
    const early = new Date('2026-04-05T10:00:00Z').getTime();
    const mid = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: late, pnl: 1 }),
      makeTrade({ timestamp: early, pnl: 2 }),
      makeTrade({ timestamp: mid, pnl: 3 }),
    ];
    const result = computeDailyPnl(trades);

    expect(result.map((d) => d.date)).toEqual([
      '2026-04-05',
      '2026-04-10',
      '2026-04-15',
    ]);
  });

  it('should classify zero-pnl trades as wins', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [makeTrade({ timestamp: ts, pnl: 0 })];
    const result = computeDailyPnl(trades);

    expect(result[0].wins).toBe(1);
    expect(result[0].losses).toBe(0);
  });

  it('should handle trades spanning many days with mixed results', () => {
    const base = new Date('2026-04-01T10:00:00Z').getTime();
    const day = 86_400_000; // 24h in ms
    const trades = [
      makeTrade({ timestamp: base, pnl: 20 }),
      makeTrade({ timestamp: base + day, pnl: -10 }),
      makeTrade({ timestamp: base + 2 * day, pnl: 5 }),
      makeTrade({ timestamp: base + 3 * day, pnl: -15 }),
      makeTrade({ timestamp: base + 4 * day, pnl: 30 }),
    ];
    const result = computeDailyPnl(trades);

    expect(result).toHaveLength(5);
    expect(result.map((d) => d.trades)).toEqual([1, 1, 1, 1, 1]);
    expect(result.map((d) => d.wins)).toEqual([1, 0, 1, 0, 1]);
    expect(result.map((d) => d.losses)).toEqual([0, 1, 0, 1, 0]);
  });
});

// ─── computeMaxDrawdown ───────────────────────────────────────────────────────

describe('computeMaxDrawdown', () => {
  it('should return 0 for empty input', () => {
    expect(computeMaxDrawdown([])).toBe(0);
  });

  it('should return 0 when all daily P&Ls are profits (no drawdown)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: 15, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBe(0);
  });

  it('should compute peak-to-trough drawdown as a fraction', () => {
    // Cumulative: 10 → 30 → 25 → 15 → 40
    // Peak = 30, trough after peak = 15 → drawdown = (30-15)/30 = 0.5
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: -5, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-04', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-05', pnl: 25, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBeCloseTo(0.5, 5);
  });

  it('should handle drawdown from peak of 0 (all losses)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: -5, trades: 1, wins: 0, losses: 1 },
    ];
    // cumulative: -10 → -15, peak stays 0, drawdown = 0 throughout
    expect(computeMaxDrawdown(days)).toBe(0);
  });

  it('should recover from drawdown and still report the peak drawdown', () => {
    // Cumulative: 50 → 80 (peak) → 60 → 40 → 70 → 90 (new peak)
    // Max drawdown = (80 - 40) / 80 = 0.5
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 50, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 30, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: -20, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-04', pnl: -20, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-05', pnl: 30, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-06', pnl: 20, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBeCloseTo(0.5, 5);
  });

  it('should handle single-day input', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBe(0);
  });
});

// ─── computeSharpeRatio ───────────────────────────────────────────────────────

describe('computeSharpeRatio', () => {
  it('should return 0 for fewer than 2 days', () => {
    expect(computeSharpeRatio([])).toBe(0);
    expect(
      computeSharpeRatio([
        { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      ]),
    ).toBe(0);
  });

  it('should return 0 when all returns are identical (stddev=0)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: 10, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeSharpeRatio(days)).toBe(0);
  });

  it('should compute positive Sharpe for positive returns', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 12, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: 8, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-04', pnl: 14, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-05', pnl: 11, trades: 1, wins: 1, losses: 0 },
    ];
    const sharpe = computeSharpeRatio(days);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('should compute negative Sharpe for negative returns', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: -12, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-03', pnl: -8, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-04', pnl: -14, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-05', pnl: -11, trades: 1, wins: 0, losses: 1 },
    ];
    const sharpe = computeSharpeRatio(days);
    expect(sharpe).toBeLessThan(0);
  });

  it('should annualize using sqrt(252)', () => {
    // Two days: pnl 0 and 20
    // mean = 10, sample stddev = sqrt(200) ≈ 14.142
    // daily Sharpe = 10/14.142 ≈ 0.7071
    // annualized = 0.7071 * sqrt(252) ≈ 11.225
    const diffDays: DailyPnl[] = [
      { date: '2026-04-01', pnl: 0, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
    ];
    const expected = (10 / Math.sqrt(200)) * Math.sqrt(252);
    expect(computeSharpeRatio(diffDays)).toBeCloseTo(expected, 4);
  });
});

// ─── computePnlSnapshot ───────────────────────────────────────────────────────

describe('computePnlSnapshot', () => {
  it('should produce a complete snapshot from a portfolio', () => {
    const day1 = new Date('2026-04-10T10:00:00Z').getTime();
    const day2 = new Date('2026-04-11T10:00:00Z').getTime();
    const closedTrades = [
      makeTrade({ timestamp: day1, pnl: 20, size: 100 }),
      makeTrade({ timestamp: day2, pnl: -10, size: 100 }),
    ];
    const portfolio = makePortfolio({
      capital: 900,
      totalPnl: 10,
      winCount: 1,
      lossCount: 1,
      closedTrades,
    });

    const snapshot = computePnlSnapshot(portfolio);

    expect(snapshot.totalPnl).toBe(10);
    expect(snapshot.realizedPnl).toBe(10);
    expect(snapshot.unrealizedPnl).toBe(0); // midpoint assumption
    expect(snapshot.openPositions).toBe(0);
    expect(snapshot.closedTrades).toBe(2);
    expect(snapshot.winRate).toBeCloseTo(0.5, 5); // 1 win / 2 total
    expect(snapshot.capitalRemaining).toBe(900);
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });

  it('should compute avgEdge as mean of (pnl / size) across closed trades', () => {
    const trades = [
      makeTrade({ pnl: 10, size: 100 }), // edge = 0.10
      makeTrade({ pnl: 5, size: 50 }), // edge = 0.10
      makeTrade({ pnl: -5, size: 100 }), // edge = -0.05
    ];
    const portfolio = makePortfolio({
      totalPnl: 10,
      winCount: 2,
      lossCount: 1,
      closedTrades: trades,
    });

    const snapshot = computePnlSnapshot(portfolio);
    // avgEdge = (0.10 + 0.10 + (-0.05)) / 3 = 0.05
    expect(snapshot.avgEdge).toBeCloseTo(0.05, 5);
  });

  it('should return avgEdge=0 when no closed trades', () => {
    const portfolio = makePortfolio({
      closedTrades: [],
      winCount: 0,
      lossCount: 0,
    });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.avgEdge).toBe(0);
  });

  it('should compute winRate=0 when no trades', () => {
    const portfolio = makePortfolio({
      winCount: 0,
      lossCount: 0,
      closedTrades: [],
    });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.winRate).toBe(0);
  });

  it('should compute winRate=1 when all wins', () => {
    const trades = [
      makeTrade({ pnl: 10 }),
      makeTrade({ pnl: 5 }),
      makeTrade({ pnl: 15 }),
    ];
    const portfolio = makePortfolio({
      winCount: 3,
      lossCount: 0,
      closedTrades: trades,
    });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.winRate).toBe(1);
  });

  it('should count open positions from portfolio', () => {
    const positions = [makeTrade({ id: 'open-1' }), makeTrade({ id: 'open-2' })];
    const portfolio = makePortfolio({ positions });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.openPositions).toBe(2);
  });

  it('should compute maxDrawdown and sharpeRatio from closed trades', () => {
    const day1 = new Date('2026-04-01T10:00:00Z').getTime();
    const day2 = new Date('2026-04-02T10:00:00Z').getTime();
    const day3 = new Date('2026-04-03T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: day1, pnl: 50 }),
      makeTrade({ timestamp: day2, pnl: -30 }),
      makeTrade({ timestamp: day3, pnl: 20 }),
    ];
    const portfolio = makePortfolio({
      totalPnl: 40,
      winCount: 2,
      lossCount: 1,
      closedTrades: trades,
    });

    const snapshot = computePnlSnapshot(portfolio);
    // Cumulative: 50 → 20 → 40; peak=50, max dd = (50-20)/50 = 0.6
    expect(snapshot.maxDrawdown).toBeCloseTo(0.6, 5);
    expect(snapshot.sharpeRatio).not.toBe(0);
  });

  it('should handle zero-size trades safely in avgEdge', () => {
    const trades = [
      makeTrade({ pnl: 10, size: 0 }),
      makeTrade({ pnl: 5, size: 100 }),
    ];
    const portfolio = makePortfolio({
      totalPnl: 15,
      winCount: 2,
      lossCount: 0,
      closedTrades: trades,
    });
    // Should not throw — size clamped to 0.0001
    expect(() => computePnlSnapshot(portfolio)).not.toThrow();
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.avgEdge).toBeDefined();
    expect(isFinite(snapshot.avgEdge)).toBe(true);
  });
});

// ─── registerPaperTradingMetrics ─────────────────────────────────────────────

describe('registerPaperTradingMetrics', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGaugeSet.mockClear();
    mockGaugeCtor.mockClear();
    mockRegistryCtor.mockClear();
  });

  it('should create 5 gauges on first call', async () => {
    const mod = await import('../paper-trading-pnl-tracker');
    const before = mockGaugeCtor.mock.calls.length;
    mod.registerPaperTradingMetrics();
    expect(mockGaugeCtor.mock.calls.length - before).toBe(5);
  });

  it('should be idempotent — second call does not create new gauges', async () => {
    const mod = await import('../paper-trading-pnl-tracker');
    mod.registerPaperTradingMetrics();
    const afterFirst = mockGaugeCtor.mock.calls.length;
    mod.registerPaperTradingMetrics();
    mod.registerPaperTradingMetrics();
    expect(mockGaugeCtor.mock.calls.length - afterFirst).toBe(0);
  });
});

// ─── updatePaperTradingMetrics ───────────────────────────────────────────────

describe('updatePaperTradingMetrics', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGaugeSet.mockClear();
    mockGaugeCtor.mockClear();
    mockRegistryCtor.mockClear();
  });

  it('should auto-register gauges if not yet registered', async () => {
    const mod = await import('../paper-trading-pnl-tracker');
    const snapshot: PnlSnapshot = {
      timestamp: 1_700_000_000_000,
      totalPnl: 100,
      unrealizedPnl: 0,
      realizedPnl: 100,
      openPositions: 2,
      closedTrades: 5,
      winRate: 0.6,
      avgEdge: 0.05,
      maxDrawdown: 0.15,
      sharpeRatio: 1.2,
      capitalRemaining: 900,
    };

    const before = mockGaugeCtor.mock.calls.length;
    mod.updatePaperTradingMetrics(snapshot);

    // Gauges should have been created (auto-register path) — delta of 5
    expect(mockGaugeCtor.mock.calls.length - before).toBe(5);
    // .set() should have been called 5 times (one per gauge)
    expect(mockGaugeSet).toHaveBeenCalledTimes(5);
  });

  it('should set gauge values from snapshot fields', async () => {
    const mod = await import('../paper-trading-pnl-tracker');
    // Pre-register so we know auto-register is not the path being tested
    mod.registerPaperTradingMetrics();
    mockGaugeSet.mockClear();
    mockGaugeCtor.mockClear();

    const snapshot: PnlSnapshot = {
      timestamp: 1_700_000_000_000,
      totalPnl: 250.5,
      unrealizedPnl: 0,
      realizedPnl: 250.5,
      openPositions: 3,
      closedTrades: 12,
      winRate: 0.75,
      avgEdge: 0.08,
      maxDrawdown: 0.12,
      sharpeRatio: 2.1,
      capitalRemaining: 750,
    };

    mod.updatePaperTradingMetrics(snapshot);

    // 5 gauges x 1 set each = 5 calls
    expect(mockGaugeSet).toHaveBeenCalledTimes(5);

    // Verify the values passed to .set() match snapshot fields
    const values = mockGaugeSet.mock.calls.map((c) => c[0]);
    expect(values).toContain(250.5); // totalPnl
    expect(values).toContain(0.75); // winRate
    expect(values).toContain(3); // openPositions
    expect(values).toContain(0.12); // maxDrawdown
    expect(values).toContain(2.1); // sharpeRatio
  });

  it('should not re-create gauges when already registered', async () => {
    const mod = await import('../paper-trading-pnl-tracker');
    mod.registerPaperTradingMetrics();
    // After register, clear call history to measure only subsequent calls
    mockGaugeCtor.mockClear();
    mockGaugeSet.mockClear();

    const snapshot: PnlSnapshot = {
      timestamp: 1_700_000_000_000,
      totalPnl: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openPositions: 0,
      closedTrades: 0,
      winRate: 0,
      avgEdge: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      capitalRemaining: 1000,
    };

    mod.updatePaperTradingMetrics(snapshot);
    mod.updatePaperTradingMetrics(snapshot);

    // No new gauges after pre-register + clear
    expect(mockGaugeCtor).toHaveBeenCalledTimes(0);
    // .set() called 5 times per update (10 total)
    expect(mockGaugeSet).toHaveBeenCalledTimes(10);
  });
});
