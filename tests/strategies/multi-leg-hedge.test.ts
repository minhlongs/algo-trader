import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcEventDeviation,
  findMostMispriced,
  calcHedgeSize,
  shouldEnterHedge,
  createMultiLegHedgeTick,
  type MultiLegHedgeDeps,
  type MultiLegHedgeConfig,
} from '../../src/desk/strategies/polymarket/multi-leg-hedge';
import type { RawOrderBook } from '../../src/desk/polymarket/clob-client';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeBook(bids: [string, string][], asks: [string, string][]): RawOrderBook {
  return {
    market: 'test-market',
    asset_id: 'test-token',
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    hash: 'abc',
  };
}

function makeEvent(
  id: string,
  markets: Array<{
    id: string;
    conditionId: string;
    yesTokenId: string;
    noTokenId?: string;
    yesPrice: number;
    closed?: boolean;
    resolved?: boolean;
    active?: boolean;
  }>,
) {
  return {
    id,
    title: `Event ${id}`,
    slug: `event-${id}`,
    description: 'Test event',
    markets: markets.map(m => ({
      id: m.id,
      question: `Market ${m.id}?`,
      slug: `market-${m.id}`,
      conditionId: m.conditionId,
      yesTokenId: m.yesTokenId,
      noTokenId: m.noTokenId ?? `no-${m.id}`,
      yesPrice: m.yesPrice,
      noPrice: 1 - m.yesPrice,
      volume: 1000,
      volume24h: 500,
      liquidity: 5000,
      endDate: '2026-12-31',
      active: m.active ?? true,
      closed: m.closed ?? false,
      resolved: m.resolved ?? false,
      outcome: null,
    })),
  };
}

function makeDeps(overrides?: Partial<MultiLegHedgeDeps>): MultiLegHedgeDeps {
  return {
    clob: { getOrderBook: vi.fn() } as any,
    orderManager: { placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }) } as any,
    eventBus: { emit: vi.fn() } as any,
    gamma: { getEvents: vi.fn().mockResolvedValue([]) } as any,
    ...overrides,
  };
}

function makeDefaultConfig(overrides?: Partial<MultiLegHedgeConfig>): Partial<MultiLegHedgeConfig> {
  return {
    deviationThreshold: 0.05,
    convergenceThreshold: 0.02,
    minMarkets: 2,
    maxMarkets: 10,
    takeProfitPct: 0.02,
    stopLossPct: 0.03,
    maxHoldMs: 1_800_000,
    maxPositions: 4,
    cooldownMs: 180_000,
    positionSize: '25',
    enableHedge: true,
    ...overrides,
  };
}

// ── calcEventDeviation tests ────────────────────────────────────────────────

describe('calcEventDeviation', () => {
  it('returns ~0 for balanced probabilities', () => {
    // Two markets: 0.5 + 0.5 = 1.0
    const dev = calcEventDeviation([0.5, 0.5]);
    expect(dev).toBeCloseTo(0);
  });

  it('returns ~0 for three balanced markets', () => {
    const dev = calcEventDeviation([1 / 3, 1 / 3, 1 / 3]);
    expect(dev).toBeCloseTo(0);
  });

  it('returns positive for overpriced event (sum > 1)', () => {
    const dev = calcEventDeviation([0.6, 0.5]);
    expect(dev).toBeGreaterThan(0);
    expect(dev).toBeCloseTo(0.1);
  });

  it('returns negative for underpriced event (sum < 1)', () => {
    const dev = calcEventDeviation([0.3, 0.4]);
    expect(dev).toBeLessThan(0);
    expect(dev).toBeCloseTo(-0.3);
  });

  it('returns 0 for empty prices array', () => {
    expect(calcEventDeviation([])).toBe(0);
  });

  it('handles single market', () => {
    const dev = calcEventDeviation([0.7]);
    expect(dev).toBeCloseTo(-0.3);
  });
});

// ── findMostMispriced tests ─────────────────────────────────────────────────

describe('findMostMispriced', () => {
  it('returns single market as most mispriced', () => {
    const result = findMostMispriced([{ id: 'a', yesPrice: 0.8 }]);
    expect(result.id).toBe('a');
    expect(result.rank).toBe(0);
  });

  it('picks highest deviation from fair value in a two-market event', () => {
    // Fair value = 0.5 each. Market B at 0.8 is further from 0.5 than A at 0.6
    const result = findMostMispriced([
      { id: 'a', yesPrice: 0.6 },
      { id: 'b', yesPrice: 0.8 },
    ]);
    expect(result.id).toBe('b');
    expect(result.yesPrice).toBe(0.8);
  });

  it('returns highest for overpriced (furthest from fair value)', () => {
    const result = findMostMispriced([
      { id: 'a', yesPrice: 0.35 },
      { id: 'b', yesPrice: 0.30 },
      { id: 'c', yesPrice: 0.45 },
    ]);
    // Fair value = 1/3 = 0.333...
    // a: |0.35 - 0.333| = 0.017
    // b: |0.30 - 0.333| = 0.033
    // c: |0.45 - 0.333| = 0.117
    expect(result.id).toBe('c');
  });

  it('handles empty array gracefully', () => {
    const result = findMostMispriced([]);
    expect(result.id).toBe('');
    expect(result.rank).toBe(-1);
  });
});

// ── calcHedgeSize tests ─────────────────────────────────────────────────────

describe('calcHedgeSize', () => {
  it('returns proportional size for deviation equal to threshold', () => {
    const size = calcHedgeSize(25, 0.05, 0.05);
    expect(size).toBe(25);
  });

  it('returns proportional smaller size for deviation below threshold', () => {
    // deviation 0.03 / threshold 0.06 = 0.5 scale
    const size = calcHedgeSize(25, 0.03, 0.06);
    expect(size).toBeCloseTo(12.5);
  });

  it('caps at base size when deviation exceeds threshold', () => {
    const size = calcHedgeSize(25, 0.10, 0.05);
    expect(size).toBe(25);
  });

  it('works with negative deviation (uses abs)', () => {
    const size = calcHedgeSize(25, -0.05, 0.05);
    expect(size).toBe(25);
  });

  it('returns base size when threshold is zero', () => {
    const size = calcHedgeSize(25, 0.05, 0);
    expect(size).toBe(25);
  });
});

// ── shouldEnterHedge tests ──────────────────────────────────────────────────

describe('shouldEnterHedge', () => {
  const cfg = makeDefaultConfig({ deviationThreshold: 0.05 }) as MultiLegHedgeConfig;

  it('returns "overpriced" when deviation is above threshold', () => {
    expect(shouldEnterHedge(0.08, cfg)).toBe('overpriced');
  });

  it('returns "underpriced" when deviation is below -threshold', () => {
    expect(shouldEnterHedge(-0.08, cfg)).toBe('underpriced');
  });

  it('returns null when deviation is within threshold', () => {
    expect(shouldEnterHedge(0.03, cfg)).toBeNull();
  });

  it('returns null when deviation exactly equals threshold', () => {
    expect(shouldEnterHedge(0.05, cfg)).toBeNull();
  });

  it('returns null when deviation is zero', () => {
    expect(shouldEnterHedge(0, cfg)).toBeNull();
  });

  it('returns "overpriced" for large positive deviation', () => {
    expect(shouldEnterHedge(0.20, cfg)).toBe('overpriced');
  });

  it('returns "underpriced" for large negative deviation', () => {
    expect(shouldEnterHedge(-0.15, cfg)).toBe('underpriced');
  });
});

// ── createMultiLegHedgeTick tests ───────────────────────────────────────────

describe('createMultiLegHedgeTick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a callable tick function', () => {
    const tick = createMultiLegHedgeTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('does not place orders when no events are returned', async () => {
    const deps = makeDeps();
    const tick = createMultiLegHedgeTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters on overpriced deviation (buys NO on most overpriced leg)', async () => {
    // Sum = 0.6 + 0.55 = 1.15, deviation = +0.15 → overpriced
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      config: makeDefaultConfig({ deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    // Primary leg should be NO (overpriced → sell the most overpriced = buy NO)
    const firstCall = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(firstCall.tokenId).toBe('no-m1'); // NO token of the most overpriced
    expect(firstCall.side).toBe('buy');
  });

  it('enters on underpriced deviation (buys YES on most underpriced leg)', async () => {
    // Sum = 0.3 + 0.35 = 0.65, deviation = -0.35 → underpriced
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.30 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.35 },
    ]);

    const book = makeBook([['0.29', '100']], [['0.31', '100']]);
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      config: makeDefaultConfig({ deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    // Primary leg should be YES (underpriced → buy the cheapest)
    const firstCall = (deps.orderManager.placeOrder as any).mock.calls[0][0];
    expect(firstCall.tokenId).toBe('yes-1'); // YES token of the most underpriced
    expect(firstCall.side).toBe('buy');
  });

  it('opens hedge leg when enableHedge is true', async () => {
    // Sum = 0.6 + 0.55 = 1.15, deviation = +0.15 → overpriced
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      config: makeDefaultConfig({ enableHedge: true, deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    // Should place 2 orders: primary + hedge
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('does not open hedge leg when enableHedge is false', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      config: makeDefaultConfig({ enableHedge: false, deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    // Should place only 1 order: primary only
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('exits on take-profit', async () => {
    // Set up overpriced event: deviation +0.15
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    // Entry book: mid = 0.575, NO entry price = 1 - 0.55 = 0.45
    const entryBook = makeBook([['0.55', '100']], [['0.60', '100']]);
    // TP book: price dropped → NO position profits. Mid = 0.40
    // NO entry at ~0.45, need price drop so NO profits by 2%
    // For NO: gain = (entryPrice - currentMid) / entryPrice
    // Need currentMid = 0.35 → gain = (0.45 - 0.35)/0.45 = 22% > 2%
    const tpBook = makeBook([['0.34', '100']], [['0.36', '100']]);

    let phase: 'entry' | 'tp' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'tp') return Promise.resolve(tpBook);
        return Promise.resolve(entryBook);
      }),
    };

    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: clob as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        enableHedge: false,
        takeProfitPct: 0.02,
        stopLossPct: 0.5,
        maxHoldMs: 999999999,
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    // Entry tick
    await tick();
    const entryCallCount = orderManager.placeOrder.mock.calls.length;
    expect(entryCallCount).toBeGreaterThan(0);

    // TP tick
    phase = 'tp';
    await tick();
    expect(orderManager.placeOrder.mock.calls.length).toBeGreaterThan(entryCallCount);
  });

  it('exits on stop-loss', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const entryBook = makeBook([['0.55', '100']], [['0.60', '100']]);
    // SL: NO position loses → price goes UP (NO side loses when underlying rises)
    // NO entry at ~0.45, need (0.45 - currentMid)/0.45 < -3%
    // currentMid = 0.70 → gain = (0.45 - 0.70) / 0.45 = -0.556 → -55.6% loss > 3% SL
    const slBook = makeBook([['0.69', '100']], [['0.71', '100']]);

    let phase: 'entry' | 'sl' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'sl') return Promise.resolve(slBook);
        return Promise.resolve(entryBook);
      }),
    };

    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: clob as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        enableHedge: false,
        takeProfitPct: 0.5,
        stopLossPct: 0.03,
        maxHoldMs: 999999999,
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    await tick();
    const entryCallCount = orderManager.placeOrder.mock.calls.length;
    expect(entryCallCount).toBeGreaterThan(0);

    phase = 'sl';
    await tick();
    expect(orderManager.placeOrder.mock.calls.length).toBeGreaterThan(entryCallCount);
  });

  it('exits on max hold time', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        enableHedge: false,
        takeProfitPct: 0.5,
        stopLossPct: 0.5,
        maxHoldMs: 1, // 1ms — will expire immediately
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    await tick();
    const entryCallCount = orderManager.placeOrder.mock.calls.length;
    expect(entryCallCount).toBeGreaterThan(0);

    await new Promise(r => setTimeout(r, 5));
    await tick();
    expect(orderManager.placeOrder.mock.calls.length).toBeGreaterThan(entryCallCount);
  });

  it('exits on convergence (deviation returns within convergenceThreshold)', async () => {
    // Overpriced event at entry
    const overpricedEvent = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    // Converged event (sum close to 1.0)
    const convergedEvent = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.51 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.50 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    let currentEvent = overpricedEvent;
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockImplementation(() => Promise.resolve([currentEvent])) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        convergenceThreshold: 0.02,
        enableHedge: false,
        takeProfitPct: 0.5,
        stopLossPct: 0.5,
        maxHoldMs: 999999999,
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    // Entry tick
    await tick();
    const entryCallCount = orderManager.placeOrder.mock.calls.length;
    expect(entryCallCount).toBeGreaterThan(0);

    // Switch to converged event
    currentEvent = convergedEvent;
    await tick();
    expect(orderManager.placeOrder.mock.calls.length).toBeGreaterThan(entryCallCount);
  });

  it('skips events with too few markets', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.90 },
    ]);

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      config: makeDefaultConfig({ minMarkets: 2 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips events with too many markets', async () => {
    const markets = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      conditionId: `c${i}`,
      yesTokenId: `yes-${i}`,
      yesPrice: 0.15, // sum = 12 * 0.15 = 1.80, big deviation
    }));
    const event = makeEvent('evt-1', markets);

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      config: makeDefaultConfig({ maxMarkets: 10 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter when deviation is within threshold', async () => {
    // Sum = 0.52 + 0.50 = 1.02, deviation = +0.02 → within 0.05 threshold
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.52 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.50 },
    ]);

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      config: makeDefaultConfig({ deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('respects cooldown after exit', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const entryBook = makeBook([['0.55', '100']], [['0.60', '100']]);
    // Force TP exit on second tick
    const tpBook = makeBook([['0.34', '100']], [['0.36', '100']]);

    let phase: 'entry' | 'tp' | 'reentry' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'tp') return Promise.resolve(tpBook);
        return Promise.resolve(entryBook);
      }),
    };

    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: clob as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        enableHedge: false,
        takeProfitPct: 0.02,
        stopLossPct: 0.5,
        maxHoldMs: 999999999,
        cooldownMs: 999999999, // very long cooldown
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    // Entry
    await tick();
    const entryCount = orderManager.placeOrder.mock.calls.length;
    expect(entryCount).toBeGreaterThan(0);

    // TP exit
    phase = 'tp';
    await tick();
    const afterExitCount = orderManager.placeOrder.mock.calls.length;
    expect(afterExitCount).toBeGreaterThan(entryCount);

    // Try re-entry: should be blocked by cooldown
    phase = 'reentry';
    await tick();
    expect(orderManager.placeOrder.mock.calls.length).toBe(afterExitCount);
  });

  it('respects maxPositions limit', async () => {
    const event1 = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);
    const event2 = makeEvent('evt-2', [
      { id: 'm3', conditionId: 'c3', yesTokenId: 'yes-3', yesPrice: 0.60 },
      { id: 'm4', conditionId: 'c4', yesTokenId: 'yes-4', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const orderManager = {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1' }),
    };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event1, event2]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      orderManager: orderManager as any,
      config: makeDefaultConfig({
        maxPositions: 1,
        enableHedge: false,
        deviationThreshold: 0.05,
      }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    // Only 1 entry order (maxPositions = 1)
    expect(orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('does not throw on gamma API error', async () => {
    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockRejectedValue(new Error('API error')) } as any,
    });
    const tick = createMultiLegHedgeTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('does not throw on clob API error', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
      config: makeDefaultConfig({ deviationThreshold: 0.05 }),
    });
    const tick = createMultiLegHedgeTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('emits trade.executed event on entry', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const book = makeBook([['0.55', '100']], [['0.60', '100']]);
    const eventBus = { emit: vi.fn() };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: { getOrderBook: vi.fn().mockResolvedValue(book) } as any,
      eventBus: eventBus as any,
      config: makeDefaultConfig({ deviationThreshold: 0.05, enableHedge: false }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();

    expect(eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({
        strategy: 'multi-leg-hedge',
        side: 'buy',
      }),
    }));
  });

  it('emits trade.executed event on exit', async () => {
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60 },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55 },
    ]);

    const entryBook = makeBook([['0.55', '100']], [['0.60', '100']]);
    const tpBook = makeBook([['0.34', '100']], [['0.36', '100']]);

    let phase: 'entry' | 'tp' = 'entry';
    const clob = {
      getOrderBook: vi.fn().mockImplementation(() => {
        if (phase === 'tp') return Promise.resolve(tpBook);
        return Promise.resolve(entryBook);
      }),
    };

    const eventBus = { emit: vi.fn() };

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      clob: clob as any,
      eventBus: eventBus as any,
      config: makeDefaultConfig({
        deviationThreshold: 0.05,
        enableHedge: false,
        takeProfitPct: 0.02,
        stopLossPct: 0.5,
        maxHoldMs: 999999999,
      }),
    });

    const tick = createMultiLegHedgeTick(deps);

    await tick();
    const entryEmitCount = eventBus.emit.mock.calls.length;

    phase = 'tp';
    await tick();
    // Should have emitted additional trade.executed for exit
    const exitEmits = eventBus.emit.mock.calls.slice(entryEmitCount);
    const tradeExitEmits = exitEmits.filter((c: any[]) => c[0] === 'trade.executed');
    expect(tradeExitEmits.length).toBeGreaterThan(0);
  });

  it('skips closed and resolved markets within an event', async () => {
    // One closed, one resolved, one active but below minMarkets after filtering
    const event = makeEvent('evt-1', [
      { id: 'm1', conditionId: 'c1', yesTokenId: 'yes-1', yesPrice: 0.60, closed: true },
      { id: 'm2', conditionId: 'c2', yesTokenId: 'yes-2', yesPrice: 0.55, resolved: true },
      { id: 'm3', conditionId: 'c3', yesTokenId: 'yes-3', yesPrice: 0.40 },
    ]);

    const deps = makeDeps({
      gamma: { getEvents: vi.fn().mockResolvedValue([event]) } as any,
      config: makeDefaultConfig({ minMarkets: 2, deviationThreshold: 0.05 }),
    });

    const tick = createMultiLegHedgeTick(deps);
    await tick();
    // Only 1 active market after filtering → below minMarkets
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });
});
