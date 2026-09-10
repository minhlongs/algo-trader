/**
 * Tests for liquidity-vacuum — pure helpers (computeTotalDepth,
 * computeDepthRatio, getVacuumDirection) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  computeTotalDepth, computeDepthRatio, getVacuumDirection,
  LiquidityVacuumStrategy, DEFAULT_CONFIG, createLiquidityVacuumTick,
} from '../../../../../src/desk/strategies/polymarket/liquidity-vacuum';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('liquidity-vacuum::computeTotalDepth', () => {
  it('sums bid and ask sizes in USDC', () => {
    const book: RawOrderBook = {
      bids: [{ price: '0.5', size: '100' }, { price: '0.4', size: '50' }],
      asks: [{ price: '0.6', size: '80' }, { price: '0.7', size: '20' }],
      timestamp: Date.now(),
    };
    expect(computeTotalDepth(book)).toBe(250);
  });

  it('returns 0 for an empty book', () => {
    expect(computeTotalDepth({ bids: [], asks: [], timestamp: 0 })).toBe(0);
  });
});

describe('liquidity-vacuum::computeDepthRatio', () => {
  it('returns 1 when no history is supplied', () => {
    expect(computeDepthRatio(500, [])).toBe(1);
  });

  it('computes current over trailing average', () => {
    expect(computeDepthRatio(100, [100, 200, 300])).toBe(100 / 200);
  });

  it('returns 1 when the average is zero', () => {
    expect(computeDepthRatio(100, [0, 0, 0])).toBe(1);
  });
});

describe('liquidity-vacuum::getVacuumDirection', () => {
  it('returns null when total depth is zero', () => {
    expect(getVacuumDirection({ bids: [], asks: [], timestamp: 0 })).toBeNull();
  });

  it('returns "yes" when asks dominate (>70%)', () => {
    const book: RawOrderBook = {
      bids: [{ price: '0.5', size: '10' }],
      asks: [{ price: '0.6', size: '90' }],
      timestamp: 0,
    };
    expect(getVacuumDirection(book)).toBe('yes');
  });

  it('returns "no" when bids dominate (<30% ask share)', () => {
    const book: RawOrderBook = {
      bids: [{ price: '0.5', size: '90' }],
      asks: [{ price: '0.6', size: '10' }],
      timestamp: 0,
    };
    expect(getVacuumDirection(book)).toBe('no');
  });

  it('returns null when neither side dominates', () => {
    const book: RawOrderBook = {
      bids: [{ price: '0.5', size: '50' }],
      asks: [{ price: '0.6', size: '50' }],
      timestamp: 0,
    };
    expect(getVacuumDirection(book)).toBeNull();
  });
});

// ── Strategy class ───────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1', question: 'q', conditionId: 'c-1', slug: 's',
    outcomes: ['Yes', 'No'], outcomePrices: ['0.5', '0.5'],
    volume: 5000, liquidity: 500, endDate: '2030-01-01',
    active: true, closed: false, tokens: [],
    yesTokenId: 'yes-1', noTokenId: 'no-1', yesPrice: 0.5, ...overrides,
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
    const i = callIdx.get(tokenId) ?? 0; callIdx.set(tokenId, i + 1);
    return bookFor ? bookFor(tokenId, i) : makeBook(100, 100);
  };
  return {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => getBook(tokenId)),
      getPrice: vi.fn(async () => 0.5), getMidPrice: vi.fn(async () => 0.5),
    } as unknown as StrategyDeps['clob'],
    orderManager: { placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })) } as unknown as StrategyDeps['orderManager'],
    eventBus: { emit: vi.fn() } as unknown as StrategyDeps['eventBus'],
    gamma: { getEvents: vi.fn(async () => []), getTrending: vi.fn(async () => []) } as unknown as StrategyDeps['gamma'],
  } as StrategyDeps;
}

describe('LiquidityVacuumStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new LiquidityVacuumStrategy(makeDeps(), { vacuumThreshold: 0.5 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.vacuumThreshold).toBe(0.5);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.recoveryThreshold).toBe(DEFAULT_CONFIG.recoveryThreshold);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o3', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips filtered markets without touching the book', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
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
      { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('records depth but waits for depthLookback before considering entry', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps(() => makeBook(100, 100)));
    const m = makeMarket();
    for (let i = 0; i < 9; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.depthHistory.get('yes-1')).toHaveLength(9);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips entry when depth ratio is above the vacuum threshold', async () => {
    // Stable depth: depthRatio = 1.0 > 0.3, so no vacuum detected.
    const strat = new LiquidityVacuumStrategy(makeDeps(() => makeBook(100, 100)));
    const m = makeMarket();
    for (let i = 0; i < 12; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters YES when a vacuum detects ask-side depletion', async () => {
    // Build a deep trailing history, then a thin book where asks dominate
    // (vacuumThreshold breached AND getVacuumDirection returns 'yes').
    const strat = new LiquidityVacuumStrategy(makeDeps());
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.depthHistory.set('yes-1', [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    // thin book with asks dominating (90 ask / 10 bid) -> 'yes'
    strat.deps.clob.getOrderBook = vi.fn(async () => makeBook(10, 90)) as unknown as typeof strat.deps.clob.getOrderBook;
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('enters NO when a vacuum detects bid-side depletion', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.depthHistory.set('yes-1', [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    // thin book with bids dominating (90 bid / 10 ask) -> 'no'
    strat.deps.clob.getOrderBook = vi.fn(async () => makeBook(90, 10)) as unknown as typeof strat.deps.clob.getOrderBook;
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('no-1');
  });

  it('falls back to yesTokenId on the no-side when market has no noTokenId', async () => {
    // Bid-dominated thin book -> 'no' direction. Without a noTokenId the
    // strategy falls back to yesTokenId (liquidity-vacuum.ts line 148).
    const strat = new LiquidityVacuumStrategy(makeDeps());
    const m = makeMarket({ noTokenId: undefined });
    // @ts-expect-error - reach into private field
    strat.depthHistory.set('yes-1', [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    strat.deps.clob.getOrderBook = vi.fn(async () => makeBook(90, 10)) as unknown as typeof strat.deps.clob.getOrderBook;
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1'); // fallback
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Vacuum scan error',
      'liquidity-vacuum',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('does not exit by default (no recovery, no TP/SL/maxHold, no custom exit)', () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('runs execute end-to-end', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'liquidity-vacuum',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new LiquidityVacuumStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Execution failed',
      'liquidity-vacuum',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createLiquidityVacuumTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
