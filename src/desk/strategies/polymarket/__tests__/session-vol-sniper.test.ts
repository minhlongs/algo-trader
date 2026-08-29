/**
 * Tests for session-vol-sniper — pure helpers (calcATR, calcAverage,
 * detectSpike, detectMeanReversion) plus the strategy class driven through
 * scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  calcATR, calcAverage, detectSpike, detectMeanReversion,
  SessionVolSniperStrategy, DEFAULT_CONFIG, createSessionVolSniperTick,
} from '../session-vol-sniper';
import type { StrategyDeps } from '../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('session-vol-sniper::calcATR', () => {
  it('returns 0 for an empty price list', () => {
    expect(calcATR([], 3)).toBe(0);
  });

  it('returns 0 for a single price point', () => {
    expect(calcATR([100], 3)).toBe(0);
  });

  it('computes the average true range across consecutive prices', () => {
    // period 3: ranges |110-100|=10, |105-110|=5, |115-105|=10 -> avg = 25/3
    expect(calcATR([100, 110, 105, 115], 3)).toBeCloseTo(25 / 3, 10);
  });
});

describe('session-vol-sniper::calcAverage', () => {
  it('returns 0 for an empty list', () => {
    expect(calcAverage([])).toBe(0);
  });

  it('averages the values', () => {
    expect(calcAverage([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('session-vol-sniper::detectSpike', () => {
  it('returns false when long-run average is zero', () => {
    expect(detectSpike(100, 0, 2)).toBe(false);
  });

  it('returns false when current ATR is below the multiplier threshold', () => {
    // rolling avg = 10, threshold = 20, current = 15 -> no spike
    expect(detectSpike(15, 10, 2)).toBe(false);
  });

  it('returns true when current ATR clears the multiplier threshold', () => {
    // rolling avg = 10, threshold = 20, current = 25 -> spike
    expect(detectSpike(25, 10, 2)).toBe(true);
  });
});

describe('session-vol-sniper::detectMeanReversion', () => {
  it('returns false when long-run average is zero', () => {
    expect(detectMeanReversion(10, 0)).toBe(false);
  });

  it('returns false when ATR is still elevated', () => {
    // avg = 10, current = 12 -> not reverted
    expect(detectMeanReversion(12, 10)).toBe(false);
  });

  it('returns true when ATR drops below the reversion threshold', () => {
    // avg = 10, current = 8 -> reverted
    expect(detectMeanReversion(8, 10)).toBe(true);
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

describe('SessionVolSniperStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new SessionVolSniperStrategy(makeDeps(), { spikeMultiplier: 3 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.spikeMultiplier).toBe(3);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.shortAtrWindow).toBe(DEFAULT_CONFIG.shortAtrWindow);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
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
    const strat = new SessionVolSniperStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
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

  it('skips mid<=0 books before ATR bookkeeping', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps(() => makeBook(0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.size).toBe(0);
  });

  it('records ATR but waits for minTicks before considering an entry', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    const m = makeMarket();
    for (let i = 0; i < 3; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('yes-1')).toHaveLength(3);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters YES when an upside ATR spike clears the threshold', async () => {
    // Seed a low-ATR history; the tick book has a wide spread so the tick ATR
    // is large relative to the rolling average -> spike detected.
    const strat = new SessionVolSniperStrategy(makeDeps(() => makeBook(0.5, 100, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('falls back to yesTokenId on the no-side when market has no noTokenId', async () => {
    // Prices are high then crash: short window ends below its start -> 'no'
    // direction. With no noTokenId the strategy must fall back to yesTokenId.
    const strat = new SessionVolSniperStrategy(makeDeps(() => makeBook(0.5, 100, 100)));
    const m = makeMarket({ noTokenId: undefined });
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1'); // fallback
  });

  it('skips entry when ATR is within the neutral band', async () => {
    // Flat book and flat history: short ATR is 0, so no spike is detected.
    const strat = new SessionVolSniperStrategy(makeDeps(() => makeBook(0.02, 100, 100)));
    const m = makeMarket();
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'session-vol-sniper',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('exits when volatility mean-reverts', () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // 21 prices: wide swing early (high longAvgAtr) then flat tail (shortAtr ~0)
    const history = [
      0.30, 0.70, 0.30, 0.70, 0.30, 0.70, 0.30, 0.70, 0.30, 0.70,
      0.30, 0.70, 0.30, 0.70, 0.30, 0.70, 0.50, 0.501, 0.499, 0.501, 0.50,
    ];
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', history);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(true);
    expect(r.reason).toContain('mean-reversion');
  });

  it('does not exit when volatility is still elevated', () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // 21 prices: flat early (low longAvgAtr), then a big swing in the short
    // window so short ATR >> long average -> no mean-reversion.
    const history = [
      0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50,
      0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.50, 0.30, 0.70, 0.30, 0.70,
    ];
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', history);
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('runs execute end-to-end', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Execution complete',
      'session-vol-sniper',
      expect.objectContaining({ openPositions: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new SessionVolSniperStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Execution failed',
      'session-vol-sniper',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createSessionVolSniperTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
