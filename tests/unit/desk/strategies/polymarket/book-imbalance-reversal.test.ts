/**
 * Tests for book-imbalance-reversal — pure helpers (calcBidVolume,
 * calcAskVolume, calcBidAskRatio, calcZScore) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  calcBidVolume, calcAskVolume, calcBidAskRatio, calcZScore,
  BookImbalanceReversalStrategy, DEFAULT_CONFIG, createBookImbalanceReversalTick,
} from '../../../../../src/desk/strategies/polymarket/book-imbalance-reversal';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('book-imbalance-reversal::calcBidVolume', () => {
  it('sums bid sizes up to the requested depth', () => {
    const bids = [{ size: '100' }, { size: '50' }, { size: '25' }];
    expect(calcBidVolume(bids, 2)).toBeCloseTo(150, 10);
  });

  it('caps at the number of available levels', () => {
    const bids = [{ size: '100' }, { size: '50' }];
    expect(calcBidVolume(bids, 10)).toBeCloseTo(150, 10);
  });

  it('returns 0 for an empty side', () => {
    expect(calcBidVolume([], 10)).toBe(0);
  });
});

describe('book-imbalance-reversal::calcAskVolume', () => {
  it('sums ask sizes up to the requested depth', () => {
    const asks = [{ size: '80' }, { size: '40' }];
    expect(calcAskVolume(asks, 1)).toBeCloseTo(80, 10);
  });

  it('caps at the number of available levels', () => {
    const asks = [{ size: '80' }];
    expect(calcAskVolume(asks, 5)).toBeCloseTo(80, 10);
  });
});

describe('book-imbalance-reversal::calcBidAskRatio', () => {
  it('returns the bid/ask volume ratio', () => {
    const book = {
      bids: [{ size: '200' }, { size: '100' }],
      asks: [{ size: '100' }],
    };
    expect(calcBidAskRatio(book, 10)).toBeCloseTo(3, 10);
  });

  it('returns Infinity when ask volume is zero but bids exist', () => {
    const book = { bids: [{ size: '100' }], asks: [{ size: '0' }] };
    expect(calcBidAskRatio(book, 10)).toBe(Infinity);
  });

  it('returns 1 for an empty book', () => {
    const book = { bids: [], asks: [] };
    expect(calcBidAskRatio(book, 10)).toBe(1);
  });
});

describe('book-imbalance-reversal::calcZScore', () => {
  it('returns 0 when history is shorter than 3 samples', () => {
    expect(calcZScore(99, [1, 1])).toBe(0);
    expect(calcZScore(99, [])).toBe(0);
  });

  it('returns 0 when history std dev is zero', () => {
    expect(calcZScore(2, [1, 1, 1])).toBe(0);
  });

  it('computes distance in std devs from the mean', () => {
    const hist = [0.9, 1.0, 1.1]; // mean 1.0, population std sqrt(0.02/3)
    const std = Math.sqrt(((0.9 - 1) ** 2 + 0 + (1.1 - 1) ** 2) / 3);
    expect(calcZScore(1.2, hist)).toBeCloseTo(0.2 / std, 10);
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

/** Book with configurable depth volumes around a 0.49/0.51 price pair (mid 0.5). */
function ratioBook(bidVol: number, askVol: number): RawOrderBook {
  return {
    bids: [{ price: '0.49', size: bidVol.toString() }],
    asks: [{ price: '0.51', size: askVol.toString() }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string, callIdx: number) => RawOrderBook): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    return bookFor ? bookFor(tokenId, i) : ratioBook(100, 100);
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

/** History around ratio 1.0 with nonzero variance (10 samples, mean 1.0, std ~0.077). */
const NEUTRAL_HISTORY = [0.9, 1.0, 1.1, 1.0, 0.9, 1.1, 1.0, 0.9, 1.0, 1.1];

describe('BookImbalanceReversalStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps(), { zScoreThreshold: 3 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.zScoreThreshold).toBe(3);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.depthLevels).toBe(DEFAULT_CONFIG.depthLevels);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o3', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips filtered markets without touching the book', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
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
      { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips mid<=0 books before ratio bookkeeping', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => ratioBook(100, 100)));
    // Overwrite the book prices to force mid 0: bids 0, asks 0.01 -> mid 0.005 <= 0? Use explicit zero book.
    const zeroBook: RawOrderBook = {
      bids: [{ price: '0', size: '100' }],
      asks: [{ price: '0', size: '100' }],
      timestamp: Date.now(),
    };
    strat.deps.clob.getOrderBook = vi.fn(async () => zeroBook);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.ratioHistory.size).toBe(0);
  });

  it('records ratios but waits for minTicks before considering an entry', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    const m = makeMarket();
    for (let i = 0; i < 3; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.ratioHistory.get('yes-1')).toHaveLength(3);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  // History tightly clustered at ratio 1.0 (std ~0.004) so that an off-scale
  // tick ratio (1.2 or 0.7) clears the z-score threshold even after the tick
  // ratio itself is appended to the history (which pulls the mean toward it).
  const TIGHT_HISTORY = [0.995, 1.0, 1.005, 1.0, 0.995, 1.005, 1.0, 0.995, 1.0, 1.005];

  it('enters NO when bid-heavy (overbought) and z-score is extreme', async () => {
    // Seed 10 ratios clustered at 1.0; the tick book is bid-heavy (120:100 -> ratio 1.2),
    // whose z-score against the seeded history lands > +2.0 -> side 'no'.
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => ratioBook(120, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...TIGHT_HISTORY]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Imbalance entry',
      'book-imbalance-reversal',
      expect.objectContaining({ conditionId: 'c-1', side: 'no' }),
    );
  });

  it('enters YES when ask-heavy (oversold) and z-score is extreme', async () => {
    // Seed 10 ratios clustered at 1.0; the tick book is ask-heavy (70:100 -> ratio 0.7),
    // whose z-score against the seeded history lands < -2.0 -> side 'yes'.
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => ratioBook(70, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...TIGHT_HISTORY]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
  });

  it('skips the no-side entry when the market has no noTokenId', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => ratioBook(120, 100)));
    const m = makeMarket({ noTokenId: undefined });
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...NEUTRAL_HISTORY]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('skips entry when z-score is within the neutral band', async () => {
    // Tick book is balanced (100:100 -> ratio 1.0) -> z ~0, below threshold.
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => ratioBook(100, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...NEUTRAL_HISTORY]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips entry when the book mid is at or beyond 0/1', async () => {
    // Book with bid 1.00 / ask 1.01 -> mid 1.005 >= 1 -> skip before ratio bookkeeping.
    const strat = new BookImbalanceReversalStrategy(makeDeps(() => {
      const b: RawOrderBook = {
        bids: [{ price: '1.00', size: '100' }],
        asks: [{ price: '1.01', size: '100' }],
        timestamp: Date.now(),
      };
      return b;
    }));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...NEUTRAL_HISTORY]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.ratioHistory.get('yes-1')).toHaveLength(10); // unchanged — mid out of range
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'book-imbalance-reversal',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('exits when imbalance mean-reverts (|z-score| < exit threshold)', () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // Balanced book -> ratio 1.0 -> z ~0 against the seeded history -> |z| < 0.5.
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...NEUTRAL_HISTORY]);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5, ratioBook(100, 100));
    expect(r.exit).toBe(true);
    expect(r.reason).toContain('mean-reversion');
  });

  it('does not exit when imbalance is still extreme', () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // Extreme ratio 1.5 -> z ~7.9, still > 0.5 -> no exit.
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [...NEUTRAL_HISTORY]);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5, ratioBook(150, 100));
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('does not exit without a book or with insufficient history', () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    expect(strat.getCustomExitCondition(pos, 0.5, undefined).exit).toBe(false);
    // @ts-expect-error - reach into private field
    strat.ratioHistory.set('yes-1', [1, 1]);
    // @ts-expect-error - call protected method for test
    expect(strat.getCustomExitCondition(pos, 0.5, ratioBook(100, 100)).exit).toBe(false);
  });

  it('runs execute end-to-end', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'book-imbalance-reversal',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new BookImbalanceReversalStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Execution failed',
      'book-imbalance-reversal',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createBookImbalanceReversalTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
