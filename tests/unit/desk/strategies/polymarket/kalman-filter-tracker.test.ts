/**
 * Tests for kalman-filter-tracker — KalmanFilter1D, calcResidualZScore,
 * KalmanFilterTrackerStrategy (scanEntries + execute), and factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  DEFAULT_CONFIG, KalmanFilter1D, calcResidualZScore,
  KalmanFilterTrackerStrategy, createKalmanFilterTrackerTick,
} from '../../../../../src/desk/strategies/polymarket/kalman-filter-tracker';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1', question: 'q', conditionId: 'c-1', slug: 's',
    outcomes: ['Yes', 'No'], outcomePrices: ['0.5', '0.5'],
    volume: 5000, liquidity: 500, endDate: '2030-01-01',
    active: true, closed: false, resolved: false,
    tokens: [],
    yesTokenId: 'yes-1', noTokenId: 'no-1', yesPrice: 0.5,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StrategyDeps> = {}): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: '0.49', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
      }),
    },
    orders: {},
    bus: { emit: vi.fn() },
    gamma: {
      getTrending: vi.fn().mockResolvedValue([]),
      getEvents: vi.fn().mockResolvedValue({ markets: [] }),
    },
    eventBus: { emit: vi.fn() },
    ...overrides,
  } as unknown as StrategyDeps;
}

function makeDepsWithBook(
  mid: number,
  bid?: number,
  ask?: number,
): StrategyDeps {
  const b = bid ?? mid - 0.01;
  const a = ask ?? mid + 0.01;
  return makeDeps({
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: b.toFixed(2), size: '100' }],
        asks: [{ price: a.toFixed(2), size: '100' }],
      }),
    },
  });
}

// ── KalmanFilter1D ──────────────────────────────────────────────────────────

describe('KalmanFilter1D', () => {
  it('initializes with default state 0.5', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    expect(kf.getState()).toBeCloseTo(0.5, 5);
  });

  it('initializes with provided state', () => {
    const kf = new KalmanFilter1D(0.01, 0.1, 0.7);
    expect(kf.getState()).toBeCloseTo(0.7, 5);
  });

  it('initializes with provided initial covariance', () => {
    const kf = new KalmanFilter1D(0.01, 0.1, 0.5, 0.05);
    expect(kf.getCovariance()).toBeCloseTo(0.05, 5);
  });

  it('state moves toward observation after update', () => {
    const kf = new KalmanFilter1D(0.01, 0.1, 0);
    kf.update(1.0);
    const s = kf.getState();
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1.0);
  });

  it('state converges to repeated observation', () => {
    const kf = new KalmanFilter1D(0.001, 0.01, 0);
    for (let i = 0; i < 50; i++) kf.update(0.8);
    expect(kf.getState()).toBeCloseTo(0.8, 1);
  });

  it('covariance stays finite after multiple updates', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    for (let i = 0; i < 10; i++) kf.update(0.5);
    expect(Number.isFinite(kf.getCovariance())).toBe(true);
    expect(kf.getCovariance()).toBeGreaterThan(0);
  });

  it('covariance decreases as observations accumulate', () => {
    const kf = new KalmanFilter1D(0.001, 0.01, 0.5, 1.0);
    kf.update(0.5);
    const c1 = kf.getCovariance();
    kf.update(0.5);
    const c2 = kf.getCovariance();
    expect(c2).toBeLessThan(c1);
  });

  it('handles extreme observation values', () => {
    const kf = new KalmanFilter1D(0.001, 0.001, 0.5);
    kf.update(0.99);
    kf.update(0.01);
    expect(Number.isFinite(kf.getState())).toBe(true);
  });
});

// ── calcResidualZScore ──────────────────────────────────────────────────────

describe('calcResidualZScore', () => {
  it('returns 0 for empty history', () => {
    expect(calcResidualZScore(0.5, [])).toBe(0);
  });

  it('returns 0 for single-element history', () => {
    expect(calcResidualZScore(0.5, [0.5])).toBe(0);
  });

  it('returns 0 for fewer than 3 points', () => {
    expect(calcResidualZScore(0.8, [0.7, 0.7])).toBe(0);
  });

  it('returns 0 for zero-variance with 3+ points', () => {
    expect(calcResidualZScore(1.0, [1, 1, 1])).toBeCloseTo(0, 0);
  });

  it('returns positive z-score when residual is high', () => {
    const hist = [0.01, 0.02, 0.01, 0.02, 0.01];
    const r = calcResidualZScore(0.1, hist);
    expect(r).toBeGreaterThan(0);
  });

  it('returns finite number', () => {
    const r = calcResidualZScore(0.05, [0.01, 0.02, 0.01, 0.02, 0.01]);
    expect(Number.isFinite(r)).toBe(true);
  });

  it('returns 0 when std dev is negative (should not happen but guarded)', () => {
    // calcStdDev returns 0 for identical values, never negative
    expect(calcResidualZScore(0.5, [0.5, 0.5, 0.5])).toBe(0);
  });
});

// ── DEFAULT_CONFIG ──────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.processNoise).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.measurementNoise).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.entryStdDev).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.minResidual).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxPositions).toBe(2);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(90_000);
  });
});

// ── KalmanFilterTrackerStrategy.scanEntries ──────────────────────────────────

describe('KalmanFilterTrackerStrategy.scanEntries', () => {
  let strategy: KalmanFilterTrackerStrategy;
  let deps: StrategyDeps;
  let market: GammaMarket;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    market = makeMarket();
    strategy = new KalmanFilterTrackerStrategy(deps, {
      scanLimit: 5,
      maxPositions: 2,
      minVolume: 1000,
      entryStdDev: 1.0,
      minResidual: 0.01,
      residualWindow: 20,
      cooldownMs: 60_000,
    });
  });

  it('skips closed markets', async () => {
    market.closed = true;
    market.volume = 9999;
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    market.resolved = true;
    market.volume = 9999;
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without yesTokenId', async () => {
    market.yesTokenId = undefined as unknown as string;
    market.volume = 9999;
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets below minVolume', async () => {
    market.volume = 500;
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('initializes filter on first observation and returns early', async () => {
    // First call: filter is created, returns early (needs 2nd observation)
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).toHaveBeenCalled();
    // Position should not be entered (no entry on first observation)
    expect((strategy as any).positions.length).toBe(0);
  });

  it('does not enter a position on first observation (needs history)', async () => {
    // Run twice to trigger filter creation
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    expect((strategy as any).positions.length).toBe(0);
  });

  it('skips when mid price is 0 or >= 1', async () => {
    // Mock getOrderBook to return extreme prices
    deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue({
          bids: [{ price: '0.99', size: '100' }],
          asks: [{ price: '1.01', size: '100' }],
        }),
      },
    });
    strategy = new KalmanFilterTrackerStrategy(deps, { scanLimit: 5 });
    await (strategy as any).scanEntries([market]);
    // getBook called but mid >= 1 → no filter initialized
    expect((strategy as any).filters.size).toBe(0);
  });

  it('skips when mid price is 0', async () => {
    deps = makeDeps({
      clob: {
        getOrderBook: vi.fn().mockResolvedValue({
          bids: [{ price: '0.00', size: '100' }],
          asks: [{ price: '0.00', size: '100' }],
        }),
      },
    });
    strategy = new KalmanFilterTrackerStrategy(deps, { scanLimit: 5 });
    await (strategy as any).scanEntries([market]);
    expect((strategy as any).filters.size).toBe(0);
  });

  it('stops scanning when maxPositions is reached', async () => {
    // Force maxPositions to 0
    strategy = new KalmanFilterTrackerStrategy(deps, { maxPositions: 0 });
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets that already have a position', async () => {
    (strategy as any).positions.push({ conditionId: 'c-1' });
    await (strategy as any).scanEntries([market]);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('logs debug on scan error', async () => {
    const errorDeps = makeDeps({
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('network')) },
    });
    strategy = new KalmanFilterTrackerStrategy(errorDeps, { scanLimit: 5 });
    await (strategy as any).scanEntries([market]);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'kalman-filter-tracker',
      expect.objectContaining({ market: 'c-1' }),
    );
  });

  it('enters a "yes" position when price drops below filtered estimate', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    // Feed stable 0.5 observations to build residual history, then diverge to 0.30
    const bookMid = (m: number) => ({
      bids: [{ price: (m - 0.01).toFixed(2), size: '100' }],
      asks: [{ price: (m + 0.01).toFixed(2), size: '100' }],
    });
    deps.clob.getOrderBook = vi.fn()
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.30));

    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);

    expect(enterSpy).toHaveBeenCalledOnce();
    expect(enterSpy).toHaveBeenCalledWith(
      'yes-1', 'c-1', 'yes',
      expect.any(Number), expect.any(Number),
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Kalman filter entry',
      'kalman-filter-tracker',
      expect.objectContaining({ side: 'yes', conditionId: 'c-1' }),
    );
  });

  it('enters a "no" position when price rises above filtered estimate', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    const bookMid = (m: number) => ({
      bids: [{ price: (m - 0.01).toFixed(2), size: '100' }],
      asks: [{ price: (m + 0.01).toFixed(2), size: '100' }],
    });
    deps.clob.getOrderBook = vi.fn()
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.75));

    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);

    expect(enterSpy).toHaveBeenCalledOnce();
    expect(enterSpy).toHaveBeenCalledWith(
      'no-1', 'c-1', 'no',
      expect.any(Number), expect.any(Number),
    );
  });

  it('skips "no" entry when market has no noTokenId', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    market.noTokenId = undefined as unknown as string;
    const bookMid = (m: number) => ({
      bids: [{ price: (m - 0.01).toFixed(2), size: '100' }],
      asks: [{ price: (m + 0.01).toFixed(2), size: '100' }],
    });
    deps.clob.getOrderBook = vi.fn()
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.75));

    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);

    expect(enterSpy).not.toHaveBeenCalled();
  });

  it('does not enter when residual is below minResidual', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    // Keep price stable — residual stays tiny, never triggers entry
    deps.clob.getOrderBook = vi.fn().mockResolvedValue({
      bids: [{ price: '0.49', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
    });
    for (let i = 0; i < 10; i++) {
      await (strategy as any).scanEntries([market]);
    }
    expect(enterSpy).not.toHaveBeenCalled();
  });

  it('does not enter when z-score is below entryStdDev', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    // Use high entryStdDev so even a divergent price won't trigger
    strategy = new KalmanFilterTrackerStrategy(deps, {
      scanLimit: 5, entryStdDev: 1000, minResidual: 0.001,
      residualWindow: 20, cooldownMs: 60_000,
    });
    (strategy as any).enterPosition = enterSpy;
    const bookMid = (m: number) => ({
      bids: [{ price: (m - 0.01).toFixed(2), size: '100' }],
      asks: [{ price: (m + 0.01).toFixed(2), size: '100' }],
    });
    deps.clob.getOrderBook = vi.fn()
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.5))
      .mockResolvedValueOnce(bookMid(0.75));

    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);
    await (strategy as any).scanEntries([market]);

    expect(enterSpy).not.toHaveBeenCalled();
  });

  it('residual history is trimmed to residualWindow * 3', async () => {
    const enterSpy = vi.fn();
    (strategy as any).enterPosition = enterSpy;
    strategy = new KalmanFilterTrackerStrategy(deps, {
      scanLimit: 5, entryStdDev: 1000, minResidual: 0.001,
      residualWindow: 3, cooldownMs: 60_000,
    });
    (strategy as any).enterPosition = enterSpy;
    deps.clob.getOrderBook = vi.fn().mockResolvedValue({
      bids: [{ price: '0.49', size: '100' }],
      asks: [{ price: '0.51', size: '100' }],
    });
    for (let i = 0; i < 50; i++) {
      await (strategy as any).scanEntries([market]);
    }
    const hist = (strategy as any).residualHistory.get('yes-1');
    expect(hist.length).toBeLessThanOrEqual(9);
  });
});

// ── KalmanFilterTrackerStrategy.execute ──────────────────────────────────────

describe('KalmanFilterTrackerStrategy.execute', () => {
  let strategy: KalmanFilterTrackerStrategy;
  let deps: StrategyDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeDeps();
    strategy = new KalmanFilterTrackerStrategy(deps, { scanLimit: 5 });
  });

  it('calls checkExits, getTrending with configured scanLimit, then scanEntries', async () => {
    await strategy.execute();
    expect(deps.gamma.getTrending).toHaveBeenCalledWith(5);
  });

  it('logs debug on successful tick', async () => {
    await strategy.execute();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tick complete',
      'kalman-filter-tracker',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs error when getTrending throws', async () => {
    deps.gamma.getTrending = vi.fn().mockRejectedValue(new Error('network'));
    await strategy.execute();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Tick failed',
      'kalman-filter-tracker',
      expect.objectContaining({ err: expect.stringContaining('network') }),
    );
  });
});

// ── createKalmanFilterTrackerTick ───────────────────────────────────────────

describe('createKalmanFilterTrackerTick', () => {
  it('returns a function that calls execute', async () => {
    const deps = makeDeps();
    const tick = createKalmanFilterTrackerTick(deps);
    expect(typeof tick).toBe('function');
    await tick();
    expect(deps.gamma.getTrending).toHaveBeenCalled();
  });
});
