/**
 * Tests for smart-money-divergence — pure helpers (computeSmartOBI,
 * getTrendDirection, detectDivergence) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  computeSmartOBI, getTrendDirection, detectDivergence,
  SmartMoneyDivergenceStrategy, DEFAULT_CONFIG, createSmartMoneyDivergenceTick,
} from '../smart-money-divergence';
import type { StrategyDeps } from '../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('smart-money-divergence::computeSmartOBI', () => {
  it('sums only the top N levels of the book', () => {
    const book: RawOrderBook = {
      bids: [
        { price: '0.49', size: '100' },
        { price: '0.48', size: '50' },
        { price: '0.47', size: '10' },
      ],
      asks: [
        { price: '0.51', size: '40' },
        { price: '0.52', size: '20' },
        { price: '0.53', size: '500' }, // beyond levels=2 — must NOT count
      ],
      timestamp: 0,
    };
    // levels=2: bids 150, asks 60 -> OBI = 150/60 = 2.5
    expect(computeSmartOBI(book, 2)).toBeCloseTo(2.5, 10);
  });

  it('returns 0.5 when the ask side dominates', () => {
    const book: RawOrderBook = {
      bids: [{ price: '0.49', size: '50' }],
      asks: [{ price: '0.51', size: '100' }],
      timestamp: 0,
    };
    expect(computeSmartOBI(book, 3)).toBeCloseTo(0.5, 10);
  });

  it('returns NaN-free 1 for an empty book at any level count', () => {
    // calcOBI guards divide-by-zero: empty book -> smartBids=smartAsks=0 -> 1
    expect(computeSmartOBI({ bids: [], asks: [], timestamp: 0 }, 3)).toBe(1);
  });
});

describe('smart-money-divergence::getTrendDirection', () => {
  it('returns 0 when fewer than 3 prices are supplied', () => {
    expect(getTrendDirection([])).toBe(0);
    expect(getTrendDirection([0.5])).toBe(0);
    expect(getTrendDirection([0.5, 0.6])).toBe(0);
  });

  it('returns 1 for a rising last-3 window', () => {
    expect(getTrendDirection([0.1, 0.2, 0.3])).toBe(1);
    // earlier history ignored — only the last 3 matter
    expect(getTrendDirection([0.9, 0.9, 0.9, 0.4, 0.5, 0.6])).toBe(1);
  });

  it('returns -1 for a falling last-3 window', () => {
    expect(getTrendDirection([0.3, 0.2, 0.1])).toBe(-1);
    expect(getTrendDirection([0.1, 0.1, 0.1, 0.9, 0.5, 0.4])).toBe(-1);
  });

  it('returns 0 for a flat window', () => {
    expect(getTrendDirection([0.5, 0.5, 0.5])).toBe(0);
  });
});

describe('smart-money-divergence::detectDivergence', () => {
  it('returns "yes" when smart money buys into a downtrend', () => {
    // obi > 1 + threshold and trend < 0
    // threshold 0.5 -> 1 + 0.5 = 1.5; 1.6 > 1.5 ✓
    expect(detectDivergence(1.6, -1, 0.5)).toBe('yes');
    expect(detectDivergence(3.0, -1, 0.5)).toBe('yes');
  });

  it('returns "no" when smart money sells into an uptrend', () => {
    // obi < 1 - threshold and trend > 0
    // threshold 0.5 -> 1 - 0.5 = 0.5; 0.4 < 0.5 ✓
    expect(detectDivergence(0.4, 1, 0.5)).toBe('no');
  });

  it('returns null when OBI and trend align (no divergence)', () => {
    // smart money buying AND price rising -> aligned, no divergence
    expect(detectDivergence(2.0, 1, 0.5)).toBeNull();
    // smart money selling AND price falling -> aligned
    expect(detectDivergence(0.2, -1, 0.5)).toBeNull();
  });

  it('returns null when OBI magnitude is inside the threshold band', () => {
    // |obi - 1| <= threshold even though directions oppose
    expect(detectDivergence(1.4, -1, 0.5)).toBeNull();
    expect(detectDivergence(0.6, 1, 0.5)).toBeNull();
  });

  it('returns null on flat trend regardless of OBI', () => {
    expect(detectDivergence(5.0, 0, 1.5)).toBeNull();
    expect(detectDivergence(0.1, 0, 1.5)).toBeNull();
  });
});

// ── Strategy class ───────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1',
    question: 'q',
    conditionId: 'c-1',
    slug: 's',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5', '0.5'],
    volume: 5000,
    liquidity: 500,
    endDate: '2030-01-01',
    active: true,
    closed: false,
    tokens: [],
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.5,
    ...overrides,
  };
}

function makeBook(bidSize: number, askSize: number, mid = 0.5): RawOrderBook {
  return {
    bids: [{ price: (mid - 0.01).toString(), size: bidSize.toString() }],
    asks: [{ price: (mid + 0.01).toString(), size: askSize.toString() }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string, callIdx: number) => RawOrderBook): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    return bookFor ? bookFor(tokenId, i) : makeBook(100, 100);
  };
  return {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => getBook(tokenId)),
      getPrice: vi.fn(async () => 0.5),
      getMidPrice: vi.fn(async () => 0.5),
    } as unknown as StrategyDeps['clob'],
    orderManager: {
      placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })),
    } as unknown as StrategyDeps['orderManager'],
    eventBus: { emit: vi.fn() } as unknown as StrategyDeps['eventBus'],
    gamma: {
      getEvents: vi.fn(async () => []),
      getTrending: vi.fn(async () => []),
    } as unknown as StrategyDeps['gamma'],
  } as StrategyDeps;
}

describe('SmartMoneyDivergenceStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps(), { obiThreshold: 2 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.obiThreshold).toBe(2);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.trendWindow).toBe(DEFAULT_CONFIG.trendWindow);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.smartLevels).toBe(DEFAULT_CONFIG.smartLevels);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 12, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 12, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 12, orderId: 'o3', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips filtered markets without touching the book', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 500 })]);
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('c-1', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 12, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips mid<=0 books before price bookkeeping', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps(() => makeBook(100, 100, 0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.size).toBe(0);
  });

  it('records prices but waits for >= trendWindow before considering entry', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    const m = makeMarket();
    for (let i = 0; i < 4; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('yes-1')).toHaveLength(4);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('trims price history to trendWindow*5 entries', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps(() => makeBook(100, 100, 0.5)));
    const m = makeMarket();
    for (let i = 0; i < 30; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('yes-1')!.length).toBeLessThanOrEqual(25);
  });

  it('enters YES when smart money buys into a downtrend', async () => {
    // OBI 250/90 = 2.78 > 1 + 1.5 threshold, trend falling -> 'yes' divergence.
    // Falling mids: each scan the book mid drops, so the last-3 window falls.
    const mids = [0.52, 0.51, 0.50, 0.49, 0.48, 0.47, 0.46, 0.45];
    const strat = new SmartMoneyDivergenceStrategy(makeDeps((_t, i) => makeBook(250, 90, mids[i % mids.length])));
    const m = makeMarket();
    for (let i = 0; i < mids.length; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Smart money entry',
      'smart-money-divergence',
      expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
    );
  });

  it('enters NO when smart money sells into an uptrend', async () => {
    // OBI 20/100 = 0.2 < 1 - 0.3 (sub-threshold scan), trend rising -> 'no' divergence.
    const mids = [0.45, 0.46, 0.47, 0.48, 0.49, 0.50, 0.51, 0.52];
    const strat = new SmartMoneyDivergenceStrategy(
      makeDeps((_t, i) => makeBook(20, 100, mids[i % mids.length])),
      { obiThreshold: 0.3 },
    );
    const m = makeMarket();
    for (let i = 0; i < mids.length; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('no-1');
  });

  it('falls back to yesTokenId on the no-side when market has no noTokenId', async () => {
    const mids = [0.45, 0.46, 0.47, 0.48, 0.49, 0.50, 0.51, 0.52];
    const strat = new SmartMoneyDivergenceStrategy(
      makeDeps((_t, i) => makeBook(20, 100, mids[i % mids.length])),
      { obiThreshold: 0.3 },
    );
    const m = makeMarket({ noTokenId: undefined });
    for (let i = 0; i < mids.length; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1');
  });

  it('skips entry when no divergence is detected', async () => {
    // Balanced book (OBI 1.0) — inside the threshold band, no divergence.
    const strat = new SmartMoneyDivergenceStrategy(makeDeps(() => makeBook(100, 100, 0.5)));
    const m = makeMarket();
    for (let i = 0; i < 8; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips entry when entryPrice leaves the valid (0,1) band', async () => {
    // Divergence present (OBI 2.78, downtrend) but ask lands at 1.0 -> skip.
    const strat = new SmartMoneyDivergenceStrategy(
      makeDeps((_t, i) => {
        if (i < 5) return makeBook(250, 90, 0.99);
        return makeBook(250, 90, 0.99); // bid 0.98, ask 1.00
      }),
    );
    const m = makeMarket();
    for (let i = 0; i < 6; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('does not enter twice for the same condition once positioned', async () => {
    const mids = [0.52, 0.51, 0.50, 0.49, 0.48, 0.47, 0.46, 0.45];
    const strat = new SmartMoneyDivergenceStrategy(makeDeps((_t, i) => makeBook(250, 90, mids[i % mids.length])));
    const m = makeMarket();
    for (let i = 0; i < 14; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1); // hasPosition filter holds
  });

  it('respects maxPositions across multiple markets', async () => {
    // Divergence on every market; three distinct conditions -> max 3 entries.
    const mids = [0.52, 0.51, 0.50, 0.49, 0.48, 0.47, 0.46, 0.45];
    const strat = new SmartMoneyDivergenceStrategy(makeDeps((_t, i) => makeBook(250, 90, mids[i % mids.length])));
    const markets = [
      makeMarket({ conditionId: 'c-1', yesTokenId: 'yes-1', noTokenId: 'no-1' }),
      makeMarket({ conditionId: 'c-2', yesTokenId: 'yes-2', noTokenId: 'no-2' }),
      makeMarket({ conditionId: 'c-3', yesTokenId: 'yes-3', noTokenId: 'no-3' }),
      makeMarket({ conditionId: 'c-4', yesTokenId: 'yes-4', noTokenId: 'no-4' }),
    ];
    for (let i = 0; i < mids.length; i++) {
      // @ts-expect-error - call protected method for markets scan
      await strat.scanEntries(markets);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(3);
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); }) as unknown as typeof strat.deps.clob.getOrderBook;
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Divergence scan error',
      'smart-money-divergence',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('exits when divergence reverses against the position side', () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps(), { obiThreshold: 0.9 });
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 12, orderId: 'o', openedAt: Date.now() };
    // Book whose OBI signals 'no' (asks dominate): smart money selling.
    // OBI = 10/200 = 0.05 < 1 - 0.9 = 0.1 ✓, trend rising -> detectDivergence = 'no' != pos.side 'yes' -> exit.
    const book = makeBook(10, 200, 0.5);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.4, 0.5, 0.6]);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5, book);
    expect(r.exit).toBe(true);
    expect(r.reason).toBe('divergence-reversed');
  });

  it('holds when divergence matches the position side', () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 12, orderId: 'o', openedAt: Date.now() };
    // Bids dominate + downtrend -> divergence 'yes' == pos.side -> hold.
    const book = makeBook(200, 10, 0.5);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.6, 0.5, 0.4]);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5, book);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('holds when no book is available for the exit check', () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 12, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5, undefined);
    expect(r.exit).toBe(false);
  });

  it('runs execute end-to-end', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'smart-money-divergence',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new SmartMoneyDivergenceStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); }) as unknown as typeof strat.deps.gamma.getTrending;
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Execution failed',
      'smart-money-divergence',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createSmartMoneyDivergenceTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
