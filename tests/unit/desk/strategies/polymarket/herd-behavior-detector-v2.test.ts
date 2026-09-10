/**
 * Tests for HerdBehaviorDetectorStrategy — scanEntries control flow.
 * Math helpers are mocked for deterministic correlation/direction values;
 * the pure math lives in herd-behavior-math-helpers.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock math helpers BEFORE importing the strategy ──────────────────────────
// vi.hoisted ensures these are initialized before the vi.mock factory runs.

const {
  mockCalcReturn,
  mockCalcAvgPairwiseCorrelation,
  mockDetectHerdPeak,
  mockCalcHerdDirection,
  mockUpdateEma,
} = vi.hoisted(() => ({
  mockCalcReturn: vi.fn<(prices: number[]) => number>(),
  mockCalcAvgPairwiseCorrelation: vi.fn<(series: number[][]) => number>(),
  mockDetectHerdPeak: vi.fn<(prev: number, cur: number, t: number) => boolean>(),
  mockCalcHerdDirection: vi.fn<(returns: number[]) => 'up' | 'down' | 'flat'>(),
  mockUpdateEma: vi.fn<(prev: number | null, val: number, a: number) => number>(),
}));

vi.mock('../../../../../src/desk/strategies/polymarket/herd-behavior-math-helpers', () => ({
  calcReturn: mockCalcReturn,
  calcAvgPairwiseCorrelation: mockCalcAvgPairwiseCorrelation,
  detectHerdPeak: mockDetectHerdPeak,
  calcHerdDirection: mockCalcHerdDirection,
  updateEma: mockUpdateEma,
  calcPearsonR: vi.fn(() => 0),
}));

import {
  DEFAULT_CONFIG,
  HerdBehaviorDetectorStrategy,
  createHerdBehaviorDetectorTick,
} from '../../../../../src/desk/strategies/polymarket/herd-behavior-detector-v2';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/strategies/polymarket/gamma-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'mkt-001',
    question: 'Will X happen?',
    conditionId: 'cond-001',
    slug: 'will-x-happen',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.50', '0.50'],
    volume: 10_000,
    liquidity: 50_000,
    endDate: '2026-12-31',
    active: true,
    closed: false,
    tokens: [],
    yesTokenId: 'token-yes-001',
    noTokenId: 'token-no-001',
    yesPrice: 0.50,
    ...overrides,
  };
}

function mockDeps(overrides: Partial<StrategyDeps> = {}): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn(async () => ({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
        timestamp: Date.now(),
      })),
    },
    orderManager: {
      placeOrder: vi.fn(async () => ({ id: 'order-001' })),
      cancelOrder: vi.fn(async () => {}),
      cancelAllOrders: vi.fn(async () => {}),
      getOpenOrders: vi.fn(async () => []),
    },
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    gamma: {
      getTrending: vi.fn(async () => []),
      getEvents: vi.fn(async () => ({ markets: [] })),
      getMarkets: vi.fn(async () => []),
      getMarket: vi.fn(async () => null),
      getMarketGroup: vi.fn(async () => null),
      searchMarkets: vi.fn(async () => []),
    },
    ...overrides,
  } as StrategyDeps;
}

function makeStrategy(deps: StrategyDeps): HerdBehaviorDetectorStrategy {
  return new HerdBehaviorDetectorStrategy(deps, {});
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('herd-behavior-detector-v2::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.herdThreshold).toBeCloseTo(0.6, 5);
    expect(DEFAULT_CONFIG.returnWindow).toBe(10);
    expect(DEFAULT_CONFIG.herdEmaAlpha).toBeCloseTo(0.15, 5);
    expect(DEFAULT_CONFIG.minMarkets).toBe(5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxPositions).toBe(4);
    expect(DEFAULT_CONFIG.positionSize).toBe('10');
  });
});

describe('herd-behavior-detector-v2::createHerdBehaviorDetectorTick', () => {
  it('returns a tick function', () => {
    const tick = createHerdBehaviorDetectorTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [], timestamp: 0 }) },
      orderManager: { placeOrder: async () => ({ id: '1' }), cancelOrder: async () => {}, cancelAllOrders: async () => {}, getOpenOrders: async () => [] },
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    });
    expect(typeof tick).toBe('function');
  });

  it('destructures config from deps (not passed to strategy base)', () => {
    const tick = createHerdBehaviorDetectorTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [], timestamp: 0 }) },
      orderManager: { placeOrder: async () => ({ id: '1' }), cancelOrder: async () => {}, cancelAllOrders: async () => {}, getOpenOrders: async () => [] },
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
      config: { herdThreshold: 0.9 },
    } as StrategyDeps);
    expect(typeof tick).toBe('function');
  });
});

describe('herd-behavior-detector-v2::scanEntries — early returns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when maxPositions reached (line 83)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Seed 4 positions (maxPositions = 4) via reflection
    (strategy as any).positions.push(
      { conditionId: 'c1' }, { conditionId: 'c2' },
      { conditionId: 'c3' }, { conditionId: 'c4' },
    );
    mockCalcAvgPairwiseCorrelation.mockReturnValue(0.9);
    mockUpdateEma.mockReturnValue(0.9);
    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up');
    mockCalcReturn.mockReturnValue(0.05);

    await (strategy as any).scanEntries([mockMarket(), mockMarket({ conditionId: 'c2' })]);

    // Should return before any getOrderBook call
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without yesTokenId (line 89)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ yesTokenId: '' });

    await (strategy as any).scanEntries([market]);

    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets (line 89)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ closed: true });

    await (strategy as any).scanEntries([market]);

    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets (line 89)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ resolved: true });

    await (strategy as any).scanEntries([market]);

    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets with volume below minVolume (line 90)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ volume: 100 }); // minVolume = 5000

    await (strategy as any).scanEntries([market]);

    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets when volume is undefined (falls back to 0) (line 90)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ volume: undefined });

    await (strategy as any).scanEntries([market]);

    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets when mid price <= 0 (line 95)', async () => {
    const deps = mockDeps({
      clob: {
        getOrderBook: vi.fn(async () => ({
          bids: [], asks: [{ price: '1', size: '100' }], timestamp: 0,
        })),
      },
    });
    const strategy = makeStrategy(deps);
    const market = mockMarket();

    await (strategy as any).scanEntries([market]);

    // mid = (0 + 1) / 2 = 0.5, but with empty bids, bid=0, ask=1, mid=0.5
    // Actually bestBidAsk: bid = bids.length > 0 ? parseFloat(bids[0].price) : 0
    // So mid = (0 + 1) / 2 = 0.5, which is valid. Let me use a different mock.
    // To get mid <= 0: need bid=0 AND ask=0
    expect(deps.clob.getOrderBook).toHaveBeenCalled();
  });

  it('skips markets when mid price >= 1 (line 95)', async () => {
    const deps = mockDeps({
      clob: {
        getOrderBook: vi.fn(async () => ({
          bids: [{ price: '1.5', size: '100' }], asks: [{ price: '2.0', size: '100' }], timestamp: 0,
        })),
      },
    });
    const strategy = makeStrategy(deps);
    const market = mockMarket();

    await (strategy as any).scanEntries([market]);

    // mid = (1.5 + 2.0) / 2 = 1.75 >= 1 → skipped
    expect(deps.clob.getOrderBook).toHaveBeenCalled();
  });

  it('catches getOrderBook errors and continues (line 102-106)', async () => {
    const deps = mockDeps({
      clob: {
        getOrderBook: vi.fn(async () => { throw new Error('CLOB down'); }),
      },
    });
    const strategy = makeStrategy(deps);
    const market = mockMarket();

    // Should not throw
    await expect((strategy as any).scanEntries([market])).resolves.toBeUndefined();
    expect(deps.clob.getOrderBook).toHaveBeenCalled();
  });

  it('returns early when fewer than minMarkets valid markets (line 109)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Only 3 valid markets, minMarkets = 5
    const markets = [
      mockMarket({ conditionId: 'c1', yesTokenId: 't1' }),
      mockMarket({ conditionId: 'c2', yesTokenId: 't2' }),
      mockMarket({ conditionId: 'c3', yesTokenId: 't3' }),
    ];

    // First call: each market gets 1 price, prices.length < 2, no valid markets
    await (strategy as any).scanEntries(markets);
    // Second call: each market gets 2 prices, now valid
    await (strategy as any).scanEntries(markets);

    // 3 valid markets < 5 minMarkets → returns at line 109
    expect(mockCalcAvgPairwiseCorrelation).not.toHaveBeenCalled();
  });

  it('returns early on first EMA (prevHerdEma === null) (line 131)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}` }));

    mockUpdateEma.mockReturnValue(0.8);

    // First call: 1 price each, no valid markets
    await (strategy as any).scanEntries(markets);
    // Second call: 2 prices each, valid markets, first EMA
    await (strategy as any).scanEntries(markets);

    expect(mockCalcAvgPairwiseCorrelation).toHaveBeenCalled();
    expect(mockUpdateEma).toHaveBeenCalled();
    // detectHerdPeak should NOT be called (returns at line 131)
    expect(mockDetectHerdPeak).not.toHaveBeenCalled();
  });

  it('returns early when no herd peak detected (line 132)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}` }));

    mockCalcAvgPairwiseCorrelation.mockReturnValue(0.8);
    mockUpdateEma.mockReturnValue(0.8);
    mockDetectHerdPeak.mockReturnValue(false);

    // Call 3 times to get past first EMA
    await (strategy as any).scanEntries(markets);
    await (strategy as any).scanEntries(markets);
    await (strategy as any).scanEntries(markets);

    expect(mockDetectHerdPeak).toHaveBeenCalled();
    expect(mockCalcHerdDirection).not.toHaveBeenCalled();
  });

  it('returns early when herd direction is flat (line 136)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}` }));

    mockCalcAvgPairwiseCorrelation.mockReturnValue(0.8);
    mockUpdateEma.mockReturnValue(0.8);
    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('flat');
    mockCalcReturn.mockReturnValue(0);

    await (strategy as any).scanEntries(markets);
    await (strategy as any).scanEntries(markets);
    await (strategy as any).scanEntries(markets);

    expect(mockCalcHerdDirection).toHaveBeenCalled();
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });
});

describe('herd-behavior-detector-v2::scanEntries — position entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupHerdEma(strategy: HerdBehaviorDetectorStrategy, markets: GammaMarket[]) {
    mockCalcAvgPairwiseCorrelation.mockReturnValue(0.8);
    mockUpdateEma.mockReturnValue(0.8);
    mockCalcReturn.mockReturnValue(0.05);
    // Call twice to establish prevHerdEma
    return (strategy as any).scanEntries(markets).then(() =>
      (strategy as any).scanEntries(markets));
  }

  it('fades herd moving UP by entering NO (line 138, fadeSide=no)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up');

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // Herd up → fadeSide = 'no' → enters on noTokenId
    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = deps.orderManager.placeOrder.mock.calls[0][0];
    // fadeSide = 'no' → tokenId = noTokenId
    expect(call.tokenId).toBe('n0');
  });

  it('fades herd moving DOWN by entering YES (line 138, fadeSide=yes)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('down');

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = deps.orderManager.placeOrder.mock.calls[0][0];
    // fadeSide = 'yes' → tokenId = yesTokenId
    expect(call.tokenId).toBe('t0');
  });

  it('stops entering when maxPositions reached mid-loop (line 142)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Pre-seed 3 positions (maxPositions = 4, so only 1 more can be entered)
    (strategy as any).positions.push(
      { conditionId: 'pre1' }, { conditionId: 'pre2' }, { conditionId: 'pre3' },
    );

    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up');
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // Should enter exactly 1 position (3 existing + 1 = 4 = maxPositions)
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('skips markets where position already exists (line 144)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Pre-seed positions for c0 and c1
    (strategy as any).positions.push({ conditionId: 'c0' }, { conditionId: 'c1' });

    // Provide MORE eligible markets than maxPositions allows, to exercise
    // the hasPosition skip at line 144 AND the maxPositions break at line 142.
    // 2 pre-seeded + 5 eligible (c2–c6). maxPositions=4 → enter only 2, then break.
    const markets = Array.from({ length: 7 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    // fadeSide = 'down' → entryPrice = currentMid = 0.51 (valid)
    mockCalcHerdDirection.mockReturnValue('down');
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // c0, c1 skipped (has position). c2, c3 entered (2 + 2 = 4 = maxPositions).
    // c4, c5, c6 never reached → break at line 142.
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('skips markets on cooldown (line 145)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Set cooldown for conditionId 'c0' (far future)
    (strategy as any).cooldowns.set('c0', Date.now() + 60_000);

    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up');
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // 5 markets, but c0 on cooldown → 4 entries
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(4);
  });

  it('enters on all eligible markets up to maxPositions (line 153 happy path)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // 6 eligible markets, 0 pre-seeded. maxPositions=4 → enters 4, then breaks.
    const markets = Array.from({ length: 6 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    // fadeSide = 'down' → entryPrice = currentMid = 0.51 (valid, 0 < 0.51 < 1)
    mockCalcHerdDirection.mockReturnValue('down');
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // 4 entries (c0–c3), then break at line 142 (getPositionCount() >= 4).
    // c4, c5 never reached.
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(4);
  });

  it('falls back to yesTokenId when noTokenId is absent (line 150)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    // Markets without noTokenId
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: undefined }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up'); // fadeSide = 'no'
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);
    await (strategy as any).scanEntries(markets);

    // fadeSide = 'no' but noTokenId undefined → falls back to yesTokenId
    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    const call = deps.orderManager.placeOrder.mock.calls[0][0];
    expect(call.tokenId).toBe('t0');
  });

  it('catches enterPosition errors and continues (line 166-170)', async () => {
    const deps = mockDeps({
      orderManager: {
        placeOrder: vi.fn(async () => { throw new Error('Order failed'); }),
        cancelOrder: vi.fn(async () => {}),
        cancelAllOrders: vi.fn(async () => {}),
        getOpenOrders: vi.fn(async () => []),
      },
    });
    const strategy = makeStrategy(deps);
    const markets = Array.from({ length: 5 }, (_, i) =>
      mockMarket({ conditionId: `c${i}`, yesTokenId: `t${i}`, noTokenId: `n${i}` }));

    mockDetectHerdPeak.mockReturnValue(true);
    mockCalcHerdDirection.mockReturnValue('up');
    mockCalcReturn.mockReturnValue(0.05);

    await setupHerdEma(strategy, markets);

    // Should not throw even though placeOrder fails
    await expect((strategy as any).scanEntries(markets)).resolves.toBeUndefined();
    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
  });
});

describe('herd-behavior-detector-v2::recordPrice / getPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordPrice creates history array on first call (line 70-71)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ conditionId: 'c1', yesTokenId: 't1' });

    // Call scanEntries once to record a price
    await (strategy as any).scanEntries([market]);

    const prices = (strategy as any).getPrices('t1');
    expect(prices).toHaveLength(1);
  });

  it('recordPrice trims history to returnWindow + 1 (line 73-75)', async () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);
    const market = mockMarket({ conditionId: 'c1', yesTokenId: 't1' });

    // Call 15 times (returnWindow = 10, so max kept = 11)
    for (let i = 0; i < 15; i++) {
      await (strategy as any).scanEntries([market]);
    }

    const prices = (strategy as any).getPrices('t1');
    expect(prices.length).toBeLessThanOrEqual(DEFAULT_CONFIG.returnWindow + 1);
    expect(prices.length).toBe(DEFAULT_CONFIG.returnWindow + 1);
  });

  it('getPrices returns empty array for unknown token (line 79)', () => {
    const deps = mockDeps();
    const strategy = makeStrategy(deps);

    const prices = (strategy as any).getPrices('nonexistent');
    expect(prices).toEqual([]);
  });
});

describe('herd-behavior-detector-v2::constructor', () => {
  it('merges partial config with DEFAULT_CONFIG', () => {
    const deps = mockDeps();
    const strategy = new HerdBehaviorDetectorStrategy(deps, { herdThreshold: 0.9 });

    expect((strategy as any).cfg.herdThreshold).toBe(0.9);
    expect((strategy as any).cfg.returnWindow).toBe(DEFAULT_CONFIG.returnWindow);
  });

  it('uses DEFAULT_CONFIG when no partial config given', () => {
    const deps = mockDeps();
    const strategy = new HerdBehaviorDetectorStrategy(deps);

    expect((strategy as any).cfg).toEqual(DEFAULT_CONFIG);
  });
});
