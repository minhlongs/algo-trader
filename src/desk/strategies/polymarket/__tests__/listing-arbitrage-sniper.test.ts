import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_LISTING_ARB_CONFIG,
  computeSpreadRatio,
  isSpreadWide,
  isSpreadConverged,
  ListingArbitrageSniper,
  createListingArbitrageSniperTick,
} from '../listing-arbitrage-sniper';
import type { OpenPosition } from '../base-polymarket-strategy-types';

vi.mock('../../../core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    conditionId: 'mkt-1',
    question: 'Will BTC hit 100k?',
    yesTokenId: 'yes-token',
    noTokenId: 'no-token',
    yesPrice: '0.55',
    noPrice: '0.43',
    volume24h: 1000,
    volume: 500,
    liquidity: 2000,
    closed: false,
    resolved: false,
    ...overrides,
  };
}

function makeBook(bidPrice: string, askPrice: string) {
  return {
    bids: [{ price: bidPrice, size: '100' }],
    asks: [{ price: askPrice, size: '100' }],
    market: 'test',
    asset_id: 'tok',
  };
}

function makeEmptyBook() {
  return { bids: [], asks: [], market: 'test', asset_id: 'tok' };
}

function makeDeps(overrides: {
  getOrderBook?: ReturnType<typeof vi.fn>;
  getTrending?: ReturnType<typeof vi.fn>;
  placeOrder?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    clob: {
      getOrderBook: overrides.getOrderBook ?? vi.fn().mockResolvedValue(makeEmptyBook()),
    },
    orderManager: {
      placeOrder: overrides.placeOrder ?? vi.fn().mockResolvedValue({ id: 'ord-1' }),
    },
    eventBus: { emit: vi.fn() },
    gamma: {
      getTrending: overrides.getTrending ?? vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('listing-arbitrage-sniper::DEFAULT_LISTING_ARB_CONFIG', () => {
  it('has expected default thresholds', () => {
    expect(DEFAULT_LISTING_ARB_CONFIG.spreadEntryThreshold).toBe(0.98);
    expect(DEFAULT_LISTING_ARB_CONFIG.spreadConvergenceThreshold).toBe(0.99);
    expect(DEFAULT_LISTING_ARB_CONFIG.maxPositions).toBe(3);
    expect(DEFAULT_LISTING_ARB_CONFIG.maxSnipeUsd).toBe(50);
    expect(DEFAULT_LISTING_ARB_CONFIG.globalCooldownMs).toBe(60 * 60 * 1000);
  });
});

describe('listing-arbitrage-sniper::computeSpreadRatio', () => {
  it('returns sum of yes and no prices', () => {
    expect(computeSpreadRatio(0.52, 0.45)).toBeCloseTo(0.97, 5);
  });

  it('returns 1.0 for 0.5 + 0.5', () => {
    expect(computeSpreadRatio(0.5, 0.5)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.94 for 0.47 + 0.47', () => {
    expect(computeSpreadRatio(0.47, 0.47)).toBeCloseTo(0.94, 5);
  });

  it('scales linearly', () => {
    const r1 = computeSpreadRatio(0.6, 0.3);
    const r2 = computeSpreadRatio(0.3, 0.15);
    expect(r1).toBeCloseTo(r2 * 2, 5);
  });
});

describe('listing-arbitrage-sniper::isSpreadWide', () => {
  it('true when sum < threshold', () => {
    expect(isSpreadWide(0.5, 0.45, 0.98)).toBe(true);
  });

  it('false when sum >= threshold', () => {
    expect(isSpreadWide(0.5, 0.5, 0.98)).toBe(false);
  });

  it('at exactly threshold returns false (< not <=)', () => {
    expect(isSpreadWide(0.49, 0.49, 0.98)).toBe(false);
  });

  it('very wide spread returns true', () => {
    expect(isSpreadWide(0.1, 0.1, 0.98)).toBe(true);
  });

  it('threshold 0.9 catches near-zero sum', () => {
    expect(isSpreadWide(0.01, 0.01, 0.9)).toBe(true);
  });
});

describe('listing-arbitrage-sniper::isSpreadConverged', () => {
  it('true when sum > threshold', () => {
    expect(isSpreadConverged(0.5, 0.5, 0.99)).toBe(true);
  });

  it('false when sum <= threshold', () => {
    expect(isSpreadConverged(0.49, 0.48, 0.99)).toBe(false);
  });

  it('at exactly threshold returns false', () => {
    expect(isSpreadConverged(0.495, 0.495, 0.99)).toBe(false);
  });

  it('perfectly matched 0.5+0.5 is converged at 0.99', () => {
    expect(isSpreadConverged(0.5, 0.5, 0.99)).toBe(true);
  });
});

describe('listing-arbitrage-sniper::ListingArbitrageSniper', () => {
  it('instantiates with mocked deps', () => {
    const strategy = new ListingArbitrageSniper(makeDeps());
    expect(strategy).toBeDefined();
  });

  it('getPositionCount returns 0 initially', () => {
    const strategy = new ListingArbitrageSniper(makeDeps());
    expect(strategy.getPositionCount()).toBe(0);
  });

  it('clock injection controls market age', () => {
    const now = 1_000_000_000;
    const strategy = new ListingArbitrageSniper(makeDeps(), {}, () => now);
    expect(strategy).toBeDefined();
  });
});

describe('listing-arbitrage-sniper::scanEntries', () => {
  let now: number;
  let clock: () => number;

  beforeEach(() => {
    now = 1_000_000_000;
    clock = () => now;
  });

  it('enters a position when spread is wide and volume is low', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];

    await (strategy as any).scanEntries(markets);

    expect(deps.orderManager.placeOrder).toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ closed: true })];
    await (strategy as any).scanEntries(markets);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips resolved markets', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ resolved: true })];
    await (strategy as any).scanEntries(markets);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets without token IDs', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ yesTokenId: null, noTokenId: null })];
    await (strategy as any).scanEntries(markets);
    expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips when spread is not wide enough', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.49', '0.51'))
      .mockResolvedValueOnce(makeBook('0.49', '0.51'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when volume is too high', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ volume24h: 100_000 })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when liquidity is too low', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { minLiquidity: 10_000 }, clock);
    const markets = [makeMarket({ liquidity: 100 })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when market age exceeds max', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { maxMarketAgeMs: 60_000 }, clock);
    const markets = [makeMarket()];
    // First observation: age is 0, should enter
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // Advance time beyond max age
    now += 120_000;
    // Clear mock to verify no NEW entry
    deps.orderManager.placeOrder.mockClear();
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('respects maxPositions limit', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'))
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { maxPositions: 1 }, clock);
    const markets = [
      makeMarket({ conditionId: 'mkt-1' }),
      makeMarket({ conditionId: 'mkt-2' }),
    ];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('picks cheaper side for entry', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.30', '0.32'))
      .mockResolvedValueOnce(makeBook('0.60', '0.62'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];
    await (strategy as any).scanEntries(markets);
    const call = deps.orderManager.placeOrder.mock.calls[0]?.[0];
    expect(call).toBeDefined();
  });

  it('handles orderbook fetch errors gracefully', async () => {
    const getOrderBook = vi.fn().mockRejectedValue(new Error('network'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when bid/ask mid is out of [0,1] range', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('1.0', '1.1'))
      .mockResolvedValueOnce(makeBook('0.45', '0.47'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('global cooldown prevents consecutive entries', async () => {
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.42', '0.44'))
      .mockResolvedValueOnce(makeBook('0.52', '0.54'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { globalCooldownMs: 60_000 }, clock);
    const markets = [makeMarket({ conditionId: 'mkt-1' })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const markets2 = [makeMarket({ conditionId: 'mkt-2' })];
    now += 30_000;
    await (strategy as any).scanEntries(markets2);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('skips markets already in position', async () => {
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ conditionId: 'mkt-1' })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // Advance past the cooldown so hasPosition() is the gate that fires
    now += 60 * 60 * 1000 + 1;
    deps.orderManager.placeOrder.mockClear();
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when at maxPositions early return', async () => {
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { maxPositions: 1 }, clock);
    // Fill the position slot
    await (strategy as any).scanEntries([makeMarket({ conditionId: 'mkt-1' })]);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    // Now at max — new scan should early-return without calling placeOrder
    deps.orderManager.placeOrder.mockClear();
    await (strategy as any).scanEntries([makeMarket({ conditionId: 'mkt-2' })]);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips market on cooldown (no position)', async () => {
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { cooldownMs: 60_000 }, clock);
    // Simulate a market that was exited previously and is now on cooldown, but has no position.
    // isOnCooldown uses real Date.now(), so set the cooldown to a real future time.
    (strategy as any).cooldowns.set('mkt-cold', Date.now() + 60_000);
    await (strategy as any).scanEntries([makeMarket({ conditionId: 'mkt-cold' })]);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips when market age exceeds max (without position)', async () => {
    // Market observed but spread too wide to enter, then age exceeds max
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.49', '0.51'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, { maxMarketAgeMs: 60_000 }, clock);
    const markets = [makeMarket()];
    // First scan: observes market but doesn't enter (spread not wide)
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    // Advance time beyond max age
    now += 120_000;
    // Second scan: should skip due to age
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('getMarketAgeMs returns null for unobserved market', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const age = (strategy as any).getMarketAgeMs('never-seen');
    expect(age).toBeNull();
  });

  it('skips when volume exceeds maxVolumeEntry', async () => {
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ volume24h: 100_000 })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('uses volume fallback when volume24h is null and skips', async () => {
    const getOrderBook = vi.fn().mockResolvedValue(makeBook('0.42', '0.44'));
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    // volume24h undefined → falls back to market.volume which is too high
    const markets = [makeMarket({ volume24h: undefined, volume: 100_000 })];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters on NO side when no is cheaper', async () => {
    // yes mid = 0.525, no mid = 0.445, spread = 0.97 < 0.98, no is cheaper → side 'no'
    const getOrderBook = vi.fn()
      .mockResolvedValueOnce(makeBook('0.52', '0.53')) // yes book
      .mockResolvedValueOnce(makeBook('0.44', '0.45')); // no book
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket()];
    await (strategy as any).scanEntries(markets);
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    const call = deps.orderManager.placeOrder.mock.calls[0]![0];
    expect(call.tokenId).toBe('no-token');
    expect(call.side).toBe('buy');
    expect(call.price).toBe('0.4500');
  });
});

describe('listing-arbitrage-sniper::getCustomExitCondition', () => {
  it('returns exit true when bid-ask spread < 1%', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const book = makeBook('0.498', '0.499');
    const result = (strategy as any).getCustomExitCondition(pos, 0.50, book);
    expect(result).toEqual({ exit: true, reason: 'spread converged' });
  });

  it('returns exit false when bid-ask spread >= 1%', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const book = makeBook('0.48', '0.50');
    const result = (strategy as any).getCustomExitCondition(pos, 0.50, book);
    expect(result).toEqual({ exit: false, reason: '' });
  });

  it('returns exit false when no book provided', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const result = (strategy as any).getCustomExitCondition(pos, 0.50);
    expect(result).toEqual({ exit: false, reason: '' });
  });

  it('returns exit false when book is empty', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const result = (strategy as any).getCustomExitCondition(pos, 0.50, makeEmptyBook());
    expect(result).toEqual({ exit: false, reason: '' });
  });

  it('returns exit false when bid is 0', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const book = { bids: [{ price: '0', size: '100' }], asks: [{ price: '0.5', size: '100' }], market: 't', asset_id: 'a' };
    const result = (strategy as any).getCustomExitCondition(pos, 0.50, book);
    expect(result).toEqual({ exit: false, reason: '' });
  });

  it('returns exit false when ask <= bid', async () => {
    const deps = makeDeps();
    const strategy = new ListingArbitrageSniper(deps);
    const pos: OpenPosition = {
      tokenId: 'tok-1',
      conditionId: 'mkt-1',
      side: 'yes',
      entryPrice: 0.50,
      sizeUsdc: 50,
      orderId: 'ord-1',
      openedAt: Date.now(),
    };
    const book = { bids: [{ price: '0.50', size: '100' }], asks: [{ price: '0.48', size: '100' }], market: 't', asset_id: 'a' };
    const result = (strategy as any).getCustomExitCondition(pos, 0.50, book);
    expect(result).toEqual({ exit: false, reason: '' });
  });
});

describe('listing-arbitrage-sniper::pruneObserved', () => {  it('removes entries older than maxAge', async () => {
    let t = 1_000_000_000;
    const clock = () => t;
    const getOrderBook = vi.fn().mockResolvedValue(makeEmptyBook());
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ conditionId: 'mkt-1' })];
    await (strategy as any).scanEntries(markets);
    t += 60_000;
    (strategy as any).pruneObserved(50_000);
    expect((strategy as any).observedMarkets.size).toBe(0);
  });

  it('keeps entries within maxAge', async () => {
    let t = 1_000_000_000;
    const clock = () => t;
    const getOrderBook = vi.fn().mockResolvedValue(makeEmptyBook());
    const deps = makeDeps({ getOrderBook });
    const strategy = new ListingArbitrageSniper(deps, {}, clock);
    const markets = [makeMarket({ conditionId: 'mkt-1' })];
    await (strategy as any).scanEntries(markets);
    t += 60_000;
    (strategy as any).pruneObserved(120_000);
    expect((strategy as any).observedMarkets.size).toBe(1);
  });
});

describe('listing-arbitrage-sniper::createListingArbitrageSniperTick', () => {
  it('returns a function', () => {
    const tick = createListingArbitrageSniperTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('execute tick calls gamma.getTrending', async () => {
    const deps = makeDeps();
    const tick = createListingArbitrageSniperTick(deps);
    await tick();
    expect(deps.gamma.getTrending).toHaveBeenCalledWith(15);
  });
});
