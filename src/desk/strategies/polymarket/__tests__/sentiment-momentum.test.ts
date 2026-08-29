/**
 * Tests for sentiment-momentum — pure helpers (calcTrendStrength,
 * calcDirection, detectVolumeConfirmation) plus the strategy class driven
 * through scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  calcTrendStrength, calcDirection, detectVolumeConfirmation,
  SentimentMomentumStrategy, DEFAULT_CONFIG, createSentimentMomentumTick,
} from '../sentiment-momentum';
import type { StrategyDeps } from '../strategy-shared-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('sentiment-momentum::calcTrendStrength', () => {
  it('returns 0 when fewer than 2*period prices', () => {
    expect(calcTrendStrength([1, 2, 3], 10)).toBe(0);
  });

  it('returns 0 when all prices are identical', () => {
    const flat = Array(30).fill(0.5);
    expect(calcTrendStrength(flat, 10)).toBe(0);
  });

  it('returns 100 for a perfect monotonic uptrend', () => {
    const up = Array.from({ length: 35 }, (_, i) => 0.5 + 0.01 * i);
    expect(calcTrendStrength(up, 10)).toBe(100);
  });

  it('returns 100 for a perfect monotonic downtrend', () => {
    const down = Array.from({ length: 35 }, (_, i) => 0.8 - 0.01 * i);
    expect(calcTrendStrength(down, 10)).toBe(100);
  });

  it('returns a mid-range score for a mixed series', () => {
    const mixed = [0.5, 0.5, 0.52, 0.5, 0.5, 0.53, 0.5, 0.5, 0.54, 0.5,
                   0.5, 0.55, 0.5, 0.5, 0.56, 0.5, 0.5, 0.57, 0.5, 0.5, 0.58];
    const s = calcTrendStrength(mixed, 5);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);
  });
});

describe('sentiment-momentum::calcDirection', () => {
  it('returns null when fewer than 2*period prices', () => {
    expect(calcDirection([1, 2, 3], 10)).toBeNull();
  });

  it('returns yes for an uptrend', () => {
    const up = Array.from({ length: 35 }, (_, i) => 0.5 + 0.01 * i);
    expect(calcDirection(up, 10)).toBe('yes');
  });

  it('returns no for a downtrend', () => {
    const down = Array.from({ length: 35 }, (_, i) => 0.8 - 0.01 * i);
    expect(calcDirection(down, 10)).toBe('no');
  });

  it('returns null when directional movement cancels out', () => {
    // Equal-sized up and down moves in the window -> posSum == negSum
    const flat = [0.5, 0.5001, 0.4999, 0.5, 0.5001, 0.4999, 0.5, 0.5001, 0.4999, 0.5,
                  0.5001, 0.4999, 0.5, 0.5001, 0.4999, 0.5, 0.5001, 0.4999, 0.5, 0.5001,
                  0.4999, 0.5, 0.5001, 0.4999, 0.5];
    expect(calcDirection(flat, 10)).toBeNull();
  });
});

describe('sentiment-momentum::detectVolumeConfirmation', () => {
  it('passes through when there is insufficient data', () => {
    expect(detectVolumeConfirmation([100, 200], 5)).toBe(true);
  });

  it('confirms when recent volume exceeds prior volume', () => {
    const vols = [100, 100, 100, 100, 100, 200, 200, 200, 200, 200];
    expect(detectVolumeConfirmation(vols, 5)).toBe(true);
  });

  it('rejects when recent volume falls below prior volume', () => {
    const vols = [200, 200, 200, 200, 200, 100, 100, 100, 100, 100];
    expect(detectVolumeConfirmation(vols, 5)).toBe(false);
  });

  it('confirms on equal volume (>= comparison)', () => {
    const vols = [150, 150, 150, 150, 150, 150, 150, 150, 150, 150];
    expect(detectVolumeConfirmation(vols, 5)).toBe(true);
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
    volume: 1000,
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
    const price = bookFor ? bookFor(tokenId, i) : 0.5;
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

// Price series rising 0.5 -> 0.84 across 35 ticks — 100 strength, direction yes
function uptrendPrices(i: number): number {
  return 0.5 + 0.01 * i;
}

describe('SentimentMomentumStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new SentimentMomentumStrategy(makeDeps(), { adxThreshold: 30 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.adxThreshold).toBe(30);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.adxPeriod).toBe(DEFAULT_CONFIG.adxPeriod);
  });

  it('records ticks and truncates history to adxPeriod*4', () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // @ts-expect-error - call private method for test
    const rec = strat.recordTick.bind(strat);
    for (let i = 0; i < 60; i++) rec('tok', 0.5 + 0.001 * i, 100);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('tok')!.length).toBe(DEFAULT_CONFIG.adxPeriod * 4);
    // @ts-expect-error - reach into private field
    expect(strat.volumeHistory.get('tok')!.length).toBe(DEFAULT_CONFIG.adxPeriod * 4);
  });

  it('skips markets with no yesTokenId', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    const m = makeMarket({ yesTokenId: '' });
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([m]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed or resolved markets', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets already holding a position', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets on cooldown', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('c-1', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('does not scan when already at max positions', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't1', conditionId: 'c1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o1', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o2', openedAt: Date.now() },
      { tokenId: 't3', conditionId: 'c3', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o3', openedAt: Date.now() },
      { tokenId: 't4', conditionId: 'c4', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o4', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips entry when price history is below minTicks', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    const m = makeMarket();
    // 3 ticks — below minTicks 15, no entry
    for (let i = 0; i < 3; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('enters yes on a strong uptrend with volume confirmation', async () => {
    // Price rises 0.50..0.69 across 20 ticks (strength 100, direction yes);
    // volume constant so recent avg >= prior avg
    const strat = new SentimentMomentumStrategy(makeDeps((_t, i) => 0.5 + 0.01 * i));
    const m = makeMarket({ volume: 2000 });
    for (let i = 0; i < 20; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Sentiment momentum entry',
      'sentiment-momentum',
      expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
    );
  });

  it('enters no on a strong downtrend', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps((_t, i) => 0.8 - 0.01 * i));
    const m = makeMarket({ volume: 2000 });
    for (let i = 0; i < 20; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
  });

  it('does not enter on a flat market (strength 0 < threshold)', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    const m = makeMarket({ volume: 2000 });
    for (let i = 0; i < 20; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('does not enter when volume is declining (divergence)', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // Volume drops each tick — recent avg < prior avg
    const marketAt = (i: number) => makeMarket({ volume: 2000 - 100 * i });
    for (let i = 0; i < 20; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([marketAt(i)]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('logs a scan error without throwing', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket()])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'sentiment-momentum',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('runs execute end-to-end', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
  });

  it('exits when trend weakening is detected via getCustomExitCondition', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // Seed a strong trend then a collapse: prev strength 100, next 0
    // @ts-expect-error - reach into private fields
    strat.priceHistory.set('yes-1', Array.from({ length: 25 }, (_, i) => 0.5 + 0.01 * i));
    // @ts-expect-error - reach into private fields
    strat.volumeHistory.set('yes-1', Array.from({ length: 25 }, () => 500));
    // @ts-expect-error - reach into private fields
    strat.prevTrendStrength.set('yes-1', 100);
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.6);
    expect(r.exit).toBe(false); // strength still 100 — not weakening yet
    // Now collapse the price series to flat — strength drops to 0
    // @ts-expect-error - reach into private fields
    strat.priceHistory.set('yes-1', Array.from({ length: 25 }, () => 0.5));
    // @ts-expect-error - call protected method for test
    const r2 = strat.getCustomExitCondition(pos, 0.6);
    expect(r2.exit).toBe(true);
    expect(r2.reason).toContain('trend-weakening');
  });

  it('exits on volume divergence via getCustomExitCondition', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // Flat prices (strength 0, prev undefined) but volume declining
    // @ts-expect-error - reach into private fields
    strat.priceHistory.set('yes-1', Array.from({ length: 25 }, () => 0.5));
    // @ts-expect-error - reach into private fields
    strat.volumeHistory.set('yes-1', [500, 500, 500, 500, 500, 100, 100, 100, 100, 100, 500, 500, 500, 500, 500, 100, 100, 100, 100, 100]);
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(true);
    expect(r.reason).toBe('volume-divergence');
  });

  it('returns no exit when neither condition fires', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    // Strong trend, steady volume — prevStrength undefined
    // @ts-expect-error - reach into private fields
    strat.priceHistory.set('yes-1', Array.from({ length: 25 }, (_, i) => 0.5 + 0.01 * i));
    // @ts-expect-error - reach into private fields
    strat.volumeHistory.set('yes-1', Array.from({ length: 25 }, () => 500));
    const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.6);
    expect(r.exit).toBe(false);
    expect(r.reason).toBe('');
  });

  it('returns no exit when there is no price history for the token', async () => {
    const strat = new SentimentMomentumStrategy(makeDeps());
    const pos = { tokenId: 'unknown', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
    // @ts-expect-error - call protected method for test
    const r = strat.getCustomExitCondition(pos, 0.5);
    expect(r.exit).toBe(false);
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createSentimentMomentumTick(makeDeps());
    expect(typeof tick).toBe('function');
  });
});
