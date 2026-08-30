/**
 * Tests for delta-neutral-portfolio-monitor — stubs delta-calculator &
 * rebalance-engine so every method path (start/stop/updatePrices/checkAll/
 * applyPaperRebalance) is exercised without real strategy wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockLogger, mockComputeDelta, mockComputePnl, mockRequiresRebalance, mockComputeSignals, mockApplySignals } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  mockComputeDelta: vi.fn(),
  mockComputePnl: vi.fn(),
  mockRequiresRebalance: vi.fn(),
  mockComputeSignals: vi.fn(),
  mockApplySignals: vi.fn(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

vi.mock('../delta-calculator', () => ({
  computePortfolioDelta: mockComputeDelta,
  computePortfolioPnl: mockComputePnl,
}));

vi.mock('../rebalance-engine', () => ({
  requiresRebalance: mockRequiresRebalance,
  computeRebalanceSignals: mockComputeSignals,
  applyRebalanceSignals: mockApplySignals,
}));

type Mod = typeof import('../delta-neutral-portfolio-monitor');
let mod: Mod;

interface TestPortfolio {
  id: string;
  positions: Array<{
    marketId: string;
    side: 'YES' | 'NO';
    size: number;
    entryPrice: number;
    currentPrice: number;
  }>;
  netDelta: number;
  totalExposure: number;
  unrealizedPnl: number;
  updatedAt: number;
}

function makePortfolio(overrides: Partial<TestPortfolio> = {}): TestPortfolio {
  return {
    id: 'p1',
    positions: [
      { marketId: 'm1', side: 'YES', size: 100, entryPrice: 0.5, currentPrice: 0.55 },
      { marketId: 'm2', side: 'NO', size: 100, entryPrice: 0.45, currentPrice: 0.45 },
    ],
    netDelta: 0,
    totalExposure: 200,
    unrealizedPnl: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    deltaThreshold: 0.1,
    checkIntervalMs: 1000,
    maxPairExposureUsdc: 1000,
    maxLegSizeUsdc: 500,
    minCorrelationConfidence: 0.8,
    paperTrading: false,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockComputeDelta.mockReturnValue({ netDelta: 0, positionDeltas: [], isNeutral: true });
  mockComputePnl.mockReturnValue(0);
  mockRequiresRebalance.mockReturnValue(false);
  mockComputeSignals.mockReturnValue({ signals: [], deltaBefore: 0, deltaAfter: 0, estimatedCost: 0 });
  mockApplySignals.mockReturnValue([]);
  vi.resetModules();
  mod = await import('../delta-neutral-portfolio-monitor');
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('start / stop', () => {
  it('start sets an interval and logs', () => {
    vi.useFakeTimers();
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.start();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Monitor] Started'),
    );
  });

  it('start is idempotent — does not set a second interval', () => {
    vi.useFakeTimers();
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.start();
    const callsAfterFirst = mockLogger.info.mock.calls.length;
    monitor.start();
    expect(mockLogger.info.mock.calls.length).toBe(callsAfterFirst);
  });

  it('stop clears the timer and logs', () => {
    vi.useFakeTimers();
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.start();
    mockLogger.info.mockClear();
    monitor.stop();
    expect(mockLogger.info).toHaveBeenCalledWith('[Monitor] Stopped');
  });

  it('stop when timer is undefined does not throw', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);
    expect(() => monitor.stop()).not.toThrow();
  });
});

describe('updatePrices', () => {
  it('updates YES position currentPrice with yesPrice', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.updatePrices('m1', 0.75, 0.25);
    expect(portfolio.positions[0].currentPrice).toBe(0.75);
    expect(portfolio.netDelta).toBe(0);
    expect(portfolio.unrealizedPnl).toBe(0);
    expect(portfolio.updatedAt).toBeTypeOf('number');
  });

  it('updates NO position currentPrice with noPrice', () => {
    const config = makeConfig();
    const portfolio = makePortfolio({
      positions: [{ marketId: 'm2', side: 'NO', size: 100, entryPrice: 0.45, currentPrice: 0.45 }],
    });
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.updatePrices('m2', 0.75, 0.25);
    expect(portfolio.positions[0].currentPrice).toBe(0.25);
  });

  it('skips portfolios with no matching market', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    const original = portfolio.positions.map((p) => p.currentPrice);
    monitor.updatePrices('unknown', 0.9, 0.1);
    expect(portfolio.positions.map((p) => p.currentPrice)).toEqual(original);
  });

  it('emits portfolio:updated after price change', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const spy = vi.fn();
    emitter.on('portfolio:updated', spy);
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    monitor.updatePrices('m1', 0.75, 0.25);
    expect(spy).toHaveBeenCalledWith(portfolio);
  });

  it('does not emit when no position changed', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const spy = vi.fn();
    emitter.on('portfolio:updated', spy);
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    // Market 'm1' exists; set prices so it changes, then call again with same market
    monitor.updatePrices('m1', 0.75, 0.25);
    spy.mockClear();
    // Now 'unknown' matches nothing
    monitor.updatePrices('unknown', 0.75, 0.25);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('checkAll (trigger rebalance)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('emits rebalance:triggered with signals when requiresRebalance true', () => {
    const config = makeConfig({ paperTrading: false });
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const spy = vi.fn();
    emitter.on('rebalance:triggered', spy);
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    mockRequiresRebalance.mockReturnValue(true);
    const fakeSignals = [{ action: 'BUY' as const, marketId: 'm1', side: 'YES' as const, size: 50, reason: 'test' }];
    mockComputeSignals.mockReturnValue({ signals: fakeSignals, deltaBefore: 0.15, deltaAfter: 0, estimatedCost: 0 });

    monitor.start();
    vi.advanceTimersByTime(1000);

    expect(spy).toHaveBeenCalledWith(fakeSignals);
  });

  it('applies paper rebalance when paperTrading enabled', () => {
    const config = makeConfig({ paperTrading: true });
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const spy = vi.fn();
    emitter.on('rebalance:completed', spy);
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    mockRequiresRebalance.mockReturnValue(true);
    mockComputeSignals.mockReturnValue({ signals: [], deltaBefore: 0.15, deltaAfter: 0, estimatedCost: 0 });

    monitor.start();
    vi.advanceTimersByTime(1000);

    expect(spy).toHaveBeenCalled();
    expect(mockApplySignals).toHaveBeenCalled();
  });

  it('does not recompute when requiresRebalance false', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);

    mockRequiresRebalance.mockReturnValue(false);
    monitor.start();
    vi.advanceTimersByTime(1000);

    expect(mockComputeSignals).not.toHaveBeenCalled();
  });
});

describe('logger import is a function (default export interop)', () => {
  it('monitor uses logger without throwing', () => {
    const config = makeConfig();
    const portfolio = makePortfolio();
    const portfolios = new Map([['p1', portfolio]]);
    const emitter = new EventEmitter();
    const monitor = new mod.DeltaNeutralPortfolioMonitor(config, portfolios, emitter);
    expect(monitor).toBeInstanceOf(mod.DeltaNeutralPortfolioMonitor);
  });
});
