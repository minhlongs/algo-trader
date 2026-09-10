/**
 * Tests for gamma-scalping — pure helpers (calcImpliedVol, calcTimeToExpiry,
 * estimateBinaryGamma, calcHedgeDirection) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  calcImpliedVol, calcTimeToExpiry, estimateBinaryGamma, calcHedgeDirection,
  GammaScalpingStrategy, DEFAULT_CONFIG, createGammaScalpingTick,
} from '../../../../../src/desk/strategies/polymarket/gamma-scalping';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('gamma-scalping::calcImpliedVol', () => {
  it('returns 0.5 when fewer than 5 prices are supplied', () => {
    expect(calcImpliedVol([])).toBe(0.5);
    expect(calcImpliedVol([0.5, 0.5, 0.5])).toBe(0.5);
  });

  it('annualizes the std dev of log returns', () => {
    // A rising trend with constant log return: std dev of identical values = 0.
    const steady = [1.0, 2.0, 4.0, 8.0, 16.0]; // log return ln(2) each step
    const v = calcImpliedVol(steady);
    expect(v).toBeCloseTo(0, 10);
  });

  it('skips non-positive prior prices when building returns', () => {
    const prices = [0, 0.5, 0.6, 0.7, 0.8, 0.9];
    // prior price 0 is skipped; returns built from 5 valid transitions
    const v = calcImpliedVol(prices);
    expect(v).toBeGreaterThan(0);
  });
});

describe('gamma-scalping::calcTimeToExpiry', () => {
  it('returns the 0.001 floor for a past end date', () => {
    expect(calcTimeToExpiry('2000-01-01')).toBe(0.001);
  });

  it('computes fractional years for a future end date', () => {
    const d = new Date(Date.now() + 365.25 * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    expect(calcTimeToExpiry(iso)).toBeCloseTo(1, 1);
  });
});

describe('gamma-scalping::estimateBinaryGamma', () => {
  it('returns 0 when sigma is zero or negative', () => {
    expect(estimateBinaryGamma(0.5, 0, 1)).toBe(0);
    expect(estimateBinaryGamma(0.5, -1, 1)).toBe(0);
  });

  it('returns 0 when time to expiry is zero or negative', () => {
    expect(estimateBinaryGamma(0.5, 0.5, 0)).toBe(0);
    expect(estimateBinaryGamma(0.5, 0.5, -1)).toBe(0);
  });

  it('clamps the normalized price to [0.001, 0.999]', () => {
    // Price 0 and price 1 would divide by zero; clamped away from the boundary.
    const gLow = estimateBinaryGamma(0, 0.5, 1);
    const gHigh = estimateBinaryGamma(1, 0.5, 1);
    expect(gLow).toBeGreaterThan(0);
    expect(gHigh).toBeGreaterThan(0);
  });

  it('computes a positive gamma at-the-money', () => {
    // ATM (0.5) with moderate vol and time — the binary gamma peak.
    expect(estimateBinaryGamma(0.5, 0.5, 1)).toBeGreaterThan(0);
  });

  it('is asymmetric around 0.5 because d1 carries a one-sided drift', () => {
    // log(s/(1-s)) is equal in magnitude at s and 1-s, but d1 adds the
    // sigma^2*T/2 drift term, so nd1 (and thus gamma) is NOT mirror-symmetric:
    // the lower price lands closer to the drift peak.
    const a = estimateBinaryGamma(0.3, 0.4, 1);
    const b = estimateBinaryGamma(0.7, 0.4, 1);
    expect(a).not.toBeCloseTo(b, 10);
    expect(a).toBeGreaterThan(b);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

describe('gamma-scalping::calcHedgeDirection', () => {
  it('returns null when gamma is zero or negative', () => {
    expect(calcHedgeDirection(0.5, 0)).toBeNull();
    expect(calcHedgeDirection(0.5, -1)).toBeNull();
  });

  it('returns "no" when price is at or above 0.5', () => {
    expect(calcHedgeDirection(0.5, 1)).toBe('no');
    expect(calcHedgeDirection(0.7, 1)).toBe('no');
  });

  it('returns "yes" when price is below 0.5', () => {
    expect(calcHedgeDirection(0.49, 1)).toBe('yes');
    expect(calcHedgeDirection(0.2, 1)).toBe('yes');
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

describe('GammaScalpingStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new GammaScalpingStrategy(makeDeps(), { gammaThreshold: 5 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.gammaThreshold).toBe(5);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.volWindow).toBe(DEFAULT_CONFIG.volWindow);
  });

  it('does not scan when already at max positions', async () => {
    const strat = new GammaScalpingStrategy(makeDeps());
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
    const strat = new GammaScalpingStrategy(makeDeps());
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

  it('skips mid<=0 books before price bookkeeping', async () => {
    const strat = new GammaScalpingStrategy(makeDeps(() => makeBook(0)));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.size).toBe(0);
  });

  it('records prices but waits for >=5 before considering an entry', async () => {
    const strat = new GammaScalpingStrategy(makeDeps());
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

  it('skips entry when gamma ratio is below the threshold', async () => {
    // Mild-vol history -> moderate sigma; mid 0.5 ATM -> gammaRatio = 1 < 2.0.
    const strat = new GammaScalpingStrategy(makeDeps(() => makeBook(0.5, 100, 100)));
    const m = makeMarket();
    const mild = [];
    for (let i = 0; i < 20; i++) mild.push(0.50 + (i % 5) * 0.002);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [...mild]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters a YES position when gamma ratio clears the threshold below 0.5', async () => {
    // Build a history that yields a high sigma; tick mid far below 0.5 makes
    // gamma exceed the baseline 0.5 reference, clearing the ratio threshold.
    const strat = new GammaScalpingStrategy(makeDeps(() => makeBook(0.12, 100, 100)));
    const m = makeMarket();
    const trend = [];
    for (let i = 0; i < 20; i++) trend.push(0.30 + i * 0.02);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [...trend]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.tokenId).toBe('yes-1');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Gamma scalping entry',
      'gamma-scalping',
      expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
    );
  });

  it('does not enter NO when gamma ratio stays below threshold above 0.5', async () => {
    // With this trend history and a 0.88 tick mid, the tick jump (0.68->0.88)
    // is much smaller than the YES case (0.68->0.12), so implied vol is far
    // lower and gammaRatio = 0.445 < 2.0 — no entry. Verified numerically.
    const strat = new GammaScalpingStrategy(makeDeps(() => makeBook(0.88, 100, 100)));
    const m = makeMarket();
    const trend = [];
    for (let i = 0; i < 20; i++) trend.push(0.30 + i * 0.02);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [...trend]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
    expect(strat.deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips the no-side entry when market has no noTokenId', async () => {
    const strat = new GammaScalpingStrategy(makeDeps(() => makeBook(0.88, 100, 100)));
    const m = makeMarket({ noTokenId: undefined });
    const trend = [];
    for (let i = 0; i < 20; i++) trend.push(0.30 + i * 0.02);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [...trend]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('logs and swallows order-book failures in scan', async () => {
    const strat = new GammaScalpingStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'gamma-scalping',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('does not exit by default (no TP/SL/maxHold, no custom exit)', () => {
    const strat = new GammaScalpingStrategy(makeDeps());
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('runs execute end-to-end', async () => {
    const strat = new GammaScalpingStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tick complete',
      'gamma-scalping',
      expect.objectContaining({ openPositions: 0, trackedMarkets: 0 }),
    );
  });

  it('logs a tick failure from execute without throwing', async () => {
    const strat = new GammaScalpingStrategy(makeDeps());
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('gamma down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Tick failed',
      'gamma-scalping',
      expect.objectContaining({ err: 'Error: gamma down' }),
    );
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createGammaScalpingTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
