/**
 * Tests for microstructure-alpha — pure helpers (calcWeightedImbalance,
 * calcSpreadPct) plus the strategy class driven through scanEntries with
 * mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  DEFAULT_CONFIG,
  calcWeightedImbalance,
  calcSpreadPct,
  MicrostructureAlphaStrategy,
  createMicrostructureAlphaTick,
} from '../microstructure-alpha';
import type { StrategyDeps } from '../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('microstructure-alpha::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.depthLevels).toBe(5);
    expect(DEFAULT_CONFIG.imbalanceThreshold).toBeCloseTo(2.0, 5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
  });
});

describe('microstructure-alpha::calcWeightedImbalance', () => {
  const mkBook = (bids: number[], asks: number[]): RawOrderBook => ({
    bids: bids.map(p => ({ price: String(p), size: '1' })),
    asks: asks.map(p => ({ price: String(p), size: '1' })),
    timestamp: Date.now(),
  });

  it('returns 1 for empty bid or ask side', () => {
    expect(calcWeightedImbalance(mkBook([], [0.5]), 5)).toBe(1);
    expect(calcWeightedImbalance(mkBook([0.5], []), 5)).toBe(1);
  });

  it('returns finite for balanced book', () => {
    const book = mkBook([0.48, 0.47, 0.46], [0.52, 0.53, 0.54]);
    const r = calcWeightedImbalance(book, 3);
    expect(Number.isFinite(r)).toBe(true);
  });

  it('returns value in valid range for equal book', () => {
    const book = mkBook([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(10);
  });

  it('returns higher imbalance for bid-heavy book (volume weighted)', () => {
    // bids have much larger volume than asks
    const book = mkBook([0.5, 0.5, 0.5], [0.51, 0.52, 0.53]);
    // override sizes to make bids heavier
    book.bids = book.bids.map(b => ({ ...b, size: '100' }));
    book.asks = book.asks.map(a => ({ ...a, size: '10' }));
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBeGreaterThan(1);
  });

  it('returns lower imbalance for ask-heavy book (volume weighted)', () => {
    const book = mkBook([0.48, 0.47, 0.46], [0.5, 0.5, 0.5]);
    book.bids = book.bids.map(b => ({ ...b, size: '10' }));
    book.asks = book.asks.map(a => ({ ...a, size: '100' }));
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBeLessThan(1);
  });

  it('handles zero ask volume', () => {
    const book = mkBook([0.5, 0.5, 0.5], [0, 0, 0]);
    book.asks = book.asks.map(a => ({ ...a, size: '0' }));
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBe(10);
  });

  it('handles zero bid volume (returns min clamp 0.1)', () => {
    const book = mkBook([0, 0, 0], [0.5, 0.5, 0.5]);
    book.bids = book.bids.map(b => ({ ...b, size: '0' }));
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBe(0.1);
  });
});

describe('microstructure-alpha::calcSpreadPct', () => {
  const mkBook = (bestBid: number, bestAsk: number): RawOrderBook => ({
    bids: bestBid > 0 ? [{ price: String(bestBid), size: '1' }] : [],
    asks: bestAsk > 0 ? [{ price: String(bestAsk), size: '1' }] : [],
    timestamp: Date.now(),
  });

  it('returns 0 for zero spread', () => {
    expect(calcSpreadPct(mkBook(0.5, 0.5))).toBeCloseTo(0, 5);
  });

  it('returns positive fraction for non-zero spread', () => {
    const r = calcSpreadPct(mkBook(0.48, 0.50));
    expect(r).toBeGreaterThan(0);
    expect(Number.isFinite(r)).toBe(true);
  });

  it('returns 0 when no bids or asks', () => {
    expect(calcSpreadPct(mkBook(0, 0))).toBe(0);
  });

  it('computes correct percentage', () => {
    // bid=0.49, ask=0.51 -> mid=0.5, spread=0.02, pct=0.04
    const r = calcSpreadPct(mkBook(0.49, 0.51));
    expect(r).toBeCloseTo(0.04, 4);
  });

  it('handles very small spread', () => {
    const r = calcSpreadPct(mkBook(0.499, 0.501));
    expect(r).toBeCloseTo(0.004, 4);
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

/** Order book with configurable volumes around a mid price. */
function imbalanceBook(
  bidVol: number,
  askVol: number,
  mid: number = 0.5
): RawOrderBook {
  const halfSpread = 0.01;
  return {
    bids: [{ price: String(mid - halfSpread), size: bidVol.toString() }],
    asks: [{ price: String(mid + halfSpread), size: askVol.toString() }],
    timestamp: Date.now(),
  };
}

function makeDeps(
  bookFor?: (tokenId: string, callIdx: number) => RawOrderBook
): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    return bookFor ? bookFor(tokenId, i) : imbalanceBook(100, 100);
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

describe('MicrostructureAlphaStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(), { imbalanceThreshold: 3 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.imbalanceThreshold).toBe(3);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.depthLevels).toBe(DEFAULT_CONFIG.depthLevels);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(), { maxPositions: 2 });
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o2', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips filtered markets without touching the book', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps());
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

  it('skips mid<=0 or mid>=1 books', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(100, 100, 0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).toHaveBeenCalled();
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);

    const strat2 = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(100, 100, 1.1)));
    // @ts-expect-error - call protected method for test
    await strat2.scanEntries([makeMarket()]);
    expect(strat2.positions.length).toBe(0);
  });

  it('skips entry when spread is too wide (>10%)', async () => {
    const wideSpreadBook = imbalanceBook(100, 100, 0.5);
    wideSpreadBook.bids[0].price = '0.4';
    wideSpreadBook.asks[0].price = '0.6'; // spread = 0.2/0.5 = 40% > 10%
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => wideSpreadBook));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters YES when imbalance >= threshold (bid heavy)', async () => {
    // imbalance = bidVol/askVol = 300/100 = 3.0 >= 2.0 threshold -> YES
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(300, 100)));
    const m = makeMarket();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Microstructure alpha entry',
      'microstructure-alpha',
      expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
    );
  });

  it('enters NO when imbalance <= 1/threshold (ask heavy)', async () => {
    // imbalance = 50/200 = 0.25 <= 0.5 (1/2.0) -> NO
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(50, 200)));
    const m = makeMarket();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
  });

  it('skips NO entry when market has no noTokenId', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(50, 200)));
    const m = makeMarket({ noTokenId: undefined });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('skips entry when imbalance is in neutral band', async () => {
    // imbalance = 150/100 = 1.5, threshold=2.0, 1/threshold=0.5 -> 0.5 < 1.5 < 2.0 = neutral
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(150, 100)));
    const m = makeMarket();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('records price history and uses SMA filter for entry (needs 2+ prices)', async () => {
    // First scan: records price, prices.length=1 < 2 -> no SMA filter -> enters
    let callCount = 0;
    const strat = new MicrostructureAlphaStrategy(
      makeDeps(() => {
        callCount++;
        return imbalanceBook(300, 100, 0.45); // mid=0.45
      }),
      { priceWindow: 2 }
    );
    const m = makeMarket();

    // First scan - records price 0.45, prices.length=1 < 2 -> no SMA filter
    // Should enter (imbalance 3.0 >= threshold 2.0, side='yes')
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('yes-1')).toHaveLength(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1); // enters on first scan (no SMA filter yet)

    // Second test: fresh strategy with pre-seeded 2 prices
    // recordPrice will add a 3rd, so SMA is over 3 prices
    // Pre-seed: [0.45, 0.5] -> after recordPrice(0.45): [0.45, 0.5, 0.45]
    // SMA = 1.4/3 = 0.4667, SMA*0.98 = 0.4573
    // mid=0.45 < 0.4573 -> SMA filter blocks YES entry
    const strat2 = new MicrostructureAlphaStrategy(
      makeDeps(() => imbalanceBook(300, 100, 0.45)),
      { priceWindow: 2 }
    );
    // @ts-expect-error - reach into private field
    strat2.priceHistory.set('yes-1', [0.45, 0.5]); // pre-seed 2 prices
    // @ts-expect-error - call protected method for test
    await strat2.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat2.positions.length).toBe(0); // SMA filter blocks (mid=0.45 < SMA*0.98)
  });

  it('uses NO side price for entry (1 - bid)', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(50, 200, 0.5)));
    const m = makeMarket();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // Entry price for NO = 1 - bid = 1 - 0.49 = 0.51
    // The book mid is 0.5, bid is 0.49, so 1 - bid = 0.51
    // enterPosition (base class) transforms side 'no' -> 'buy', formats price as string '0.5100', adds orderType: 'GTC'
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy', price: '0.5100', orderType: 'GTC' })
    );
  });

  it('skips entry when volume < minVolume', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(() => imbalanceBook(300, 100)));
    const m = makeMarket({ volume: 500 }); // below minVolume default 1000
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('respects scanLimit from config', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps(), { scanLimit: 2 });
    const markets = [
      makeMarket({ conditionId: 'c-1' }),
      makeMarket({ conditionId: 'c-2', yesTokenId: 'yes-2' }),
      makeMarket({ conditionId: 'c-3', yesTokenId: 'yes-3' })
    ];
    // Mock getTrending to respect the scanLimit argument
    strat.deps.gamma.getTrending = vi.fn(async (limit?: number) => markets.slice(0, limit ?? markets.length));
    // @ts-expect-error - call execute (public method)
    await strat.execute();
    // Should only scan first 2 markets (scanLimit=2)
    // checkExits calls getOrderBook for existing positions only
    // Since we have no positions, only scanEntries calls getOrderBook
    // scanEntries iterates up to scanLimit markets
    expect(strat.deps.clob.getOrderBook).toHaveBeenCalledTimes(2);
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'microstructure-alpha',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('calls checkExits then scanEntries in execute', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps());
    // @ts-expect-error - call execute (public method)
    await strat.execute();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tick complete',
      'microstructure-alpha',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new MicrostructureAlphaStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    // @ts-expect-error - call execute (public method)
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Tick failed',
      'microstructure-alpha',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createMicrostructureAlphaTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});