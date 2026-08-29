/**
 * Tests for order-flow-toxicity — pure helpers (estimateTradeImbalance,
 * calcVPIN, calcToxicityZScore) plus the strategy class driven through
 * scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  estimateTradeImbalance, calcVPIN, calcToxicityZScore,
  OrderFlowToxicityStrategy, DEFAULT_CONFIG, createOrderFlowToxicityTick,
} from '../order-flow-toxicity';
import type { StrategyDeps } from '../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

function volBook(bidVol: number, askVol: number): RawOrderBook {
  return {
    bids: [{ price: '0.49', size: bidVol.toString() }],
    asks: [{ price: '0.51', size: askVol.toString() }],
    timestamp: Date.now(),
  };
}

describe('order-flow-toxicity::estimateTradeImbalance', () => {
  it('returns 0 when total volume change is zero', () => {
    expect(estimateTradeImbalance(volBook(100, 100), volBook(100, 100))).toBe(0);
  });

  it('returns positive when bid-side volume is consumed (buy pressure)', () => {
    // prevBid 100 -> currBid 40: bidDelta = 60; ask unchanged -> imb = 1
    expect(estimateTradeImbalance(volBook(100, 100), volBook(40, 100))).toBe(1);
  });

  it('returns negative when ask-side volume is consumed (sell pressure)', () => {
    // bidDelta = 0; askDelta = 60 -> imb = -1
    expect(estimateTradeImbalance(volBook(100, 100), volBook(100, 40))).toBe(-1);
  });

  it('returns 0 for mirrored one-for-one shifts', () => {
    // bidDelta = 50, askDelta = -50: |50| + |-50| = 100, (50-(-50))/100 = 1
    expect(estimateTradeImbalance(volBook(100, 100), volBook(50, 150))).toBe(1);
  });
});

describe('order-flow-toxicity::calcVPIN', () => {
  it('returns 0.5 for an empty imbalance list', () => {
    expect(calcVPIN([])).toBe(0.5);
  });

  it('returns the fraction of buy-initiated buckets', () => {
    expect(calcVPIN([1, -1, 1, 1])).toBe(0.75);
  });

  it('returns 0 when all buckets are sell-initiated', () => {
    expect(calcVPIN([-1, -1])).toBe(0);
  });

  it('returns 1 when all buckets are buy-initiated', () => {
    expect(calcVPIN([0.5, 1, 2])).toBe(1);
  });
});

describe('order-flow-toxicity::calcToxicityZScore', () => {
  it('uses mean 0.5 and std 0.1 defaults for empty history', () => {
    expect(calcToxicityZScore(0.7, [])).toBeCloseTo(2, 10);
  });

  it('uses std 0.1 default for a single-sample history', () => {
    expect(calcToxicityZScore(0.6, [0.5])).toBeCloseTo(1, 10);
  });

  it('returns 0 when history std dev is zero', () => {
    expect(calcToxicityZScore(0.5, [0.5, 0.5, 0.5])).toBe(0);
  });

  it('computes the distance in std devs from the mean', () => {
    const hist = [0.4, 0.5, 0.6]; // mean 0.5
    const std = Math.sqrt(((0.4 - 0.5) ** 2 + (0.5 - 0.5) ** 2 + (0.6 - 0.5) ** 2) / 2);
    expect(calcToxicityZScore(0.7, hist)).toBeCloseTo(Math.abs(0.7 - 0.5) / std, 10);
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
    volume: 2000,
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

function makeBook(price: number, bidVol = 100, askVol = 100): RawOrderBook {
  return {
    bids: [{ price: (price - 0.01).toString(), size: bidVol.toString() }],
    asks: [{ price: (price + 0.01).toString(), size: askVol.toString() }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string, callIdx: number) => RawOrderBook): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    return bookFor ? bookFor(tokenId, i) : makeBook(0.5);
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

describe('OrderFlowToxicityStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps(), { bucketCount: 20 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.bucketCount).toBe(20);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.toxicityThreshold).toBe(DEFAULT_CONFIG.toxicityThreshold);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps());
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
    const strat = new OrderFlowToxicityStrategy(makeDeps());
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

  it('skips mid<=0 books before imbalance bookkeeping', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.prevBooks.size).toBe(0);
  });

  it('opens a yes position when VPIN stays healthy with buy pressure', async () => {
    // Book consumes bid volume each tick -> imb = +1 (buy bucket).
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0.5, 40, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.prevBooks.set('yes-1', makeBook(0.5, 100, 100));
    // 5 buy + 4 sell pre-seeded; tick adds a buy bucket -> 6/10 = 0.6,
    // not > 0.6 threshold -> healthy; empty vpinHistory -> zScore 0.
    // @ts-expect-error - reach into private field
    strat.imbalanceHistory.set('yes-1', [1, 1, 1, 1, 1, -1, -1, -1, -1]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Order flow entry',
      'order-flow-toxicity',
      expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
    );
  });

  it('opens a no position when VPIN stays healthy with sell pressure', async () => {
    // Book consumes ask volume each tick -> imb = -1 (sell bucket).
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0.5, 100, 40)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.prevBooks.set('yes-1', makeBook(0.5, 100, 100));
    // 4 buy + 5 sell pre-seeded; tick adds a sell bucket -> 4/10 = 0.4,
    // not < 0.4 boundary -> healthy.
    // @ts-expect-error - reach into private field
    strat.imbalanceHistory.set('yes-1', [1, 1, 1, 1, -1, -1, -1, -1, -1]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
  });

  it('skips the no-side entry when market has no noTokenId', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0.5, 100, 40)));
    const m = makeMarket({ noTokenId: undefined });
    // @ts-expect-error - reach into private field
    strat.prevBooks.set('yes-1', makeBook(0.5, 100, 100));
    // @ts-expect-error - reach into private field
    strat.imbalanceHistory.set('yes-1', [1, 1, 1, 1, 1, 1, -1, -1, -1]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('pauses entries while flow is toxic (VPIN above threshold)', async () => {
    // 9 pre-seeded buy buckets + a 10th buy bucket -> VPIN = 1.0 > 0.6
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0.5, 40, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.prevBooks.set('yes-1', makeBook(0.5, 100, 100));
    // @ts-expect-error - reach into private field
    strat.imbalanceHistory.set('yes-1', Array(9).fill(1));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Toxic flow — skip',
      'order-flow-toxicity',
      expect.objectContaining({ conditionId: 'c-1' }),
    );
  });

  it('skips the entry when the toxicity z-score exceeds 2.0', async () => {
    // VPIN 0.6 is healthy, but the seeded vpinHistory clusters at 0.5 so
    // the 0.6 reading lands > 2 std devs out once appended.
    const strat = new OrderFlowToxicityStrategy(makeDeps(() => makeBook(0.5, 40, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.prevBooks.set('yes-1', makeBook(0.5, 100, 100));
    // @ts-expect-error - reach into private field
    strat.imbalanceHistory.set('yes-1', [1, 1, 1, 1, 1, -1, -1, -1, -1]);
    // @ts-expect-error - reach into private field
    strat.vpinHistory.set('yes-1', Array(9).fill(0.5));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Toxic flow — skip',
      'order-flow-toxicity',
      expect.objectContaining({ conditionId: 'c-1' }),
    );
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'order-flow-toxicity',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('runs execute end-to-end', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tick complete',
      'order-flow-toxicity',
      expect.objectContaining({ openPositions: 0, trackedMarkets: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new OrderFlowToxicityStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Tick failed',
      'order-flow-toxicity',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createOrderFlowToxicityTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
