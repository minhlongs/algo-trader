/**
 * Tests for twap-accumulator — pure helpers (computeAverageEntryPrice,
 * isSliceDue, getAccumulationDirection) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  computeAverageEntryPrice, isSliceDue, getAccumulationDirection,
  TwapAccumulatorStrategy, DEFAULT_CONFIG, createTwapAccumulatorTick,
} from '../twap-accumulator';
import type { StrategyDeps } from '../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('twap-accumulator::computeAverageEntryPrice', () => {
  it('returns 0 for an empty slice list', () => {
    expect(computeAverageEntryPrice([])).toBe(0);
  });

  it('averages accumulated slice prices', () => {
    expect(computeAverageEntryPrice([0.5, 0.6])).toBeCloseTo(0.55, 10);
  });
});

describe('twap-accumulator::isSliceDue', () => {
  it('is due when interval has elapsed', () => {
    expect(isSliceDue(Date.now() - 120_000, 60_000)).toBe(true);
  });

  it('is not due when interval has not elapsed', () => {
    expect(isSliceDue(Date.now() - 10_000, 60_000)).toBe(false);
  });

  it('is due immediately when lastSliceAt is 0', () => {
    expect(isSliceDue(0, 60_000)).toBe(true);
  });
});

describe('twap-accumulator::getAccumulationDirection', () => {
  it('returns yes for cheap mids', () => {
    expect(getAccumulationDirection(0.01, 0.02)).toBe('yes');
  });

  it('returns no for expensive mids', () => {
    expect(getAccumulationDirection(0.99, 0.02)).toBe('no');
  });

  it('returns null for mid-range prices', () => {
    expect(getAccumulationDirection(0.5, 0.02)).toBeNull();
  });
});

// ── Strategy class ──────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1',
    question: 'q',
    conditionId: 'c-1',
    slug: 's',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5', '0.5'],
    volume: 10_000,
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

function makeBook(price: number) {
  return {
    bids: [{ price: (price - 0.01).toString(), size: '100' }],
    asks: [{ price: (price + 0.01).toString(), size: '100' }],
    timestamp: Date.now(),
  };
}

function makeDeps(bookFor?: (tokenId: string, callIdx: number) => number): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    const price = bookFor ? bookFor(tokenId, i) : 0.1;
    return makeBook(price);
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

describe('TwapAccumulatorStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new TwapAccumulatorStrategy(makeDeps(), { numSlices: 10 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.numSlices).toBe(10);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.targetSizeUsdc).toBe(DEFAULT_CONFIG.targetSizeUsdc);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
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

  it('skips markets with no yesTokenId', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed, resolved, positioned, cooled-down, or low-volume markets', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 100 })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips mid-range markets (no accumulation direction)', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps(() => 0.5));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // No accumulator created — no slice executed
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
    // @ts-expect-error - reach into private field
    expect(strat.accumulators.size).toBe(0);
  });

  it('starts an accumulator and executes the first slice for a cheap market', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps(() => 0.02));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.accumulators.size).toBe(1);
    // @ts-expect-error - reach into private field
    const acc = Array.from(strat.accumulators.values())[0]!;
    expect(acc.direction).toBe('yes');
    expect(acc.slicesFilled).toBe(1);
    expect(acc.entryPrices).toHaveLength(1);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'TWAP slice executed',
      'twap-accumulator',
      expect.objectContaining({ conditionId: 'c-1', slice: '1/5' }),
    );
  });

  it('accumulates NO for an expensive market', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps(() => 0.99));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    const acc = Array.from(strat.accumulators.values())[0]!;
    expect(acc.direction).toBe('no');
    expect(acc.slicesFilled).toBe(1);
  });

  it('does not execute a second slice before sliceIntervalMs elapses', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps(() => 0.02));
    const m = makeMarket();
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // Second scan immediately — lastSliceAt is now, interval 60s
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('skips a slice when slippage exceeds maxSlippage', async () => {
    // Accumulator bought its first slice at 0.03; the book has since run to
    // 0.30 -> next entry would be ask 0.31 vs avg 0.03 = ~933% slippage.
    const strat = new TwapAccumulatorStrategy(makeDeps(() => 0.30), { sliceIntervalMs: 0 });
    // @ts-expect-error - reach into private field
    strat.accumulators.set('c-1', {
      marketId: 'yes-1', conditionId: 'c-1', yesTokenId: 'yes-1', direction: 'yes',
      targetSize: 100, sliceSize: 20, slicesFilled: 1, totalSlices: 5,
      lastSliceAt: 0, entryPrices: [0.03], side: 'yes',
    });
    // @ts-expect-error - reach into private field
    const acc = strat.accumulators.get('c-1')!;
    // @ts-expect-error - call private method for test
    await strat.processSlice(acc);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'TWAP slice skipped — slippage too high',
      'twap-accumulator',
      expect.anything(),
    );
  });

  it('exits via getCustomExitCondition when all slices filled', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.accumulators.set('c-1', {
      marketId: 'yes-1', conditionId: 'c-1', yesTokenId: 'yes-1', direction: 'yes',
      targetSize: 100, sliceSize: 20, slicesFilled: 5, totalSlices: 5,
      lastSliceAt: 0, entryPrices: [0.1], side: 'yes',
    });
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(true);
    expect(r.reason).toBe('all-slices-filled');
  });

  it('does not exit when slices remain or no accumulator exists', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.accumulators.set('c-1', {
      marketId: 'yes-1', conditionId: 'c-1', yesTokenId: 'yes-1', direction: 'yes',
      targetSize: 100, sliceSize: 20, slicesFilled: 2, totalSlices: 5,
      lastSliceAt: 0, entryPrices: [0.1], side: 'yes',
    });
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for sentiment momentum test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(false);
    const other = { tokenId: 'x', conditionId: 'unknown', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r2 = strat.getCustomExitCondition(other, 0.5);
    expect(r2.exit).toBe(false);
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'TWAP scan error',
      'twap-accumulator',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('logs slice errors without throwing', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // Seed an accumulator directly, then fail its book fetch
    // @ts-expect-error - reach into private field
    strat.accumulators.set('c-1', {
      marketId: 'yes-1', conditionId: 'c-1', yesTokenId: 'yes-1', direction: 'yes',
      targetSize: 100, sliceSize: 20, slicesFilled: 0, totalSlices: 5,
      lastSliceAt: 0, entryPrices: [], side: 'yes',
    });
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('slice book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'TWAP slice error',
      'twap-accumulator',
      expect.objectContaining({ conditionId: 'c-1', err: 'Error: slice book down' }),
    );
  });

  it('cleans up completed accumulators', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.accumulators.set('done', {
      marketId: 'yes-1', conditionId: 'c-done', yesTokenId: 'yes-1', direction: 'yes',
      targetSize: 100, sliceSize: 20, slicesFilled: 5, totalSlices: 5,
      lastSliceAt: 0, entryPrices: [], side: 'yes',
    });
    // @ts-expect-error - reach into private field
    strat.lastCleanup = 0; // force cleanup pass
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([]);
    // @ts-expect-error - reach into private field
    expect(strat.accumulators.has('done')).toBe(false);
  });

  it('runs execute end-to-end', async () => {
    const strat = new TwapAccumulatorStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createTwapAccumulatorTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
