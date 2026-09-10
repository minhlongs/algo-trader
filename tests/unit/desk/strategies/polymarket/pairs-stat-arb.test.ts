/**
 * Tests for pairs-stat-arb — pure helpers + the strategy class.
 *
 * The four exported math functions (calcSpread, calcBollingerBands,
 * calcSpreadZScore, calcPairCorr) are exercised directly. The strategy class
 * is driven through scanEntries with mocked deps (clob/orders/bus/gamma) so
 * the full pair-scan + entry pipeline runs without a live Polymarket
 * connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  calcSpread, calcBollingerBands, calcSpreadZScore, calcPairCorr,
  PairsStatArbStrategy, DEFAULT_CONFIG,
} from '../../../../../src/desk/strategies/polymarket/pairs-stat-arb';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/strategy-shared-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('pairs-stat-arb::calcSpread', () => {
  it('returns priceA minus priceB', () => {
    expect(calcSpread(0.6, 0.4)).toBeCloseTo(0.2, 10);
    expect(calcSpread(0.4, 0.6)).toBeCloseTo(-0.2, 10);
  });
});

describe('pairs-stat-arb::calcBollingerBands', () => {
  it('returns zeros when fewer than 3 spreads', () => {
    expect(calcBollingerBands([0.1, 0.2], 2)).toEqual({ mean: 0, std: 0, upper: 0, lower: 0 });
  });

  it('computes mean/std and symmetric bands', () => {
    const bands = calcBollingerBands([0.1, 0.2, 0.3, 0.4, 0.5], 2);
    expect(bands.mean).toBeCloseTo(0.3, 10);
    expect(bands.std).toBeGreaterThan(0);
    expect(bands.upper).toBeCloseTo(bands.mean + 2 * bands.std, 10);
    expect(bands.lower).toBeCloseTo(bands.mean - 2 * bands.std, 10);
  });
});

describe('pairs-stat-arb::calcSpreadZScore', () => {
  it('returns 0 when fewer than 3 spreads', () => {
    expect(calcSpreadZScore(0.5, [0.1, 0.2])).toBe(0);
  });

  it('returns 0 when std is 0', () => {
    expect(calcSpreadZScore(0.5, [0.3, 0.3, 0.3, 0.3])).toBe(0);
  });

  it('computes the z-score of the current spread', () => {
    const z = calcSpreadZScore(0.5, [0.1, 0.2, 0.3, 0.4]);
    expect(z).toBeGreaterThan(0);
    expect(Number.isFinite(z)).toBe(true);
  });
});

describe('pairs-stat-arb::calcPairCorr', () => {
  it('returns 0 when fewer than 5 prices', () => {
    expect(calcPairCorr([0.1, 0.2, 0.3, 0.4], [0.1, 0.2, 0.3, 0.4])).toBe(0);
  });

  it('returns 0 when fewer than 5 valid returns', () => {
    // zero prices invalidate the return computation
    expect(calcPairCorr([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])).toBe(0);
  });

  it('returns 1 for perfectly correlated series', () => {
    // Returns are exactly 2:1 (A: 0.5/0.25, B: 1.0/0.5) — no float noise, corr is exactly 1
    const a = [8, 12, 15, 22.5, 28.125, 42.1875, 52.734375, 79.1015625];
    const b = [3, 6, 9, 18, 27, 54, 81, 162];
    expect(calcPairCorr(a, b)).toBeCloseTo(1, 5);
  });

  it('clamps the result to [-1, 1]', () => {
    const a = [1.0, 1.1, 0.9, 1.2, 0.8, 1.3, 0.7, 1.4];
    const b = [1.0, 0.9, 1.1, 0.8, 1.2, 0.7, 1.3, 0.6];
    const c = calcPairCorr(a, b);
    expect(c).toBeGreaterThanOrEqual(-1);
    expect(c).toBeLessThanOrEqual(1);
  });
});

// ── Strategy class ───────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    conditionId: 'c-1',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    closed: false,
    resolved: false,
    volume: 2000,
    yesPrice: 0.5,
    title: 't', slug: 's', active: true, endDate: '2030-01-01',
    tokens: [],
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

function makeDeps(gammaEvents: GammaMarket[][], bookFor?: (tokenId: string, callIdx: number) => number): StrategyDeps {
  const callIdx = new Map<string, number>();
  const getBook = (tokenId: string) => {
    const i = callIdx.get(tokenId) ?? 0;
    callIdx.set(tokenId, i + 1);
    const price = bookFor ? bookFor(tokenId, i) : (tokenId === 'yes-1' ? 0.6 : tokenId === 'yes-2' ? 0.4 : 0.5);
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
      getEvents: vi.fn(async () => gammaEvents.shift() ?? []),
      getTrending: vi.fn(async () => []),
    } as unknown as StrategyDeps['gamma'],
  } as StrategyDeps;
}

describe('PairsStatArbStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new PairsStatArbStrategy(makeDeps([]), { bandWidth: 3.0 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.bandWidth).toBe(3.0);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.windowSize).toBe(DEFAULT_CONFIG.windowSize);
  });

  it('records prices and truncates history to windowSize*4', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    // @ts-expect-error - reach into private field
    const rec = strat.recordPrice.bind(strat);
    for (let i = 0; i < 250; i++) rec('tok', 0.5 + (i % 10) * 0.01);
    // @ts-expect-error - reach into private field
    expect(strat.priceHistory.get('tok')!.length).toBe(DEFAULT_CONFIG.windowSize * 4);
  });

  it('skips pairs missing a yesTokenId', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    const a = makeMarket({ conditionId: 'a', yesTokenId: '' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-b' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('skips closed or resolved markets', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    const a = makeMarket({ conditionId: 'a', closed: true });
    const b = makeMarket({ conditionId: 'b' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('skips when position count is at the max', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 't', conditionId: 'c', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() },
      { tokenId: 't2', conditionId: 'c2', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o2', openedAt: Date.now() },
    );
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    // No entry attempted — pairStatus stays empty
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.size).toBe(0);
  });

  it('skips pairs with insufficient price history', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.size).toBe(0);
  });

  it('skips pairs below the minimum correlation', async () => {
    // A oscillates wildly, B is nearly flat -> corr < 0.6
    const lowA = [0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8];
    const lowB = [0.5, 0.500909, 0.499243, 0.499721, 0.500989, 0.499456, 0.499463, 0.500991, 0.499712, 0.499249, 0.500913, 0.499991, 0.499094, 0.500763, 0.500271, 0.499012, 0.500551, 0.500529, 0.499008, 0.500296, 0.500745];
    const strat = new PairsStatArbStrategy(makeDeps([], (tok, i) => (tok === 'yes-1' ? lowA[i]! : lowB[i]!)));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    for (let i = 0; i < 21; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanPair(a, b);
    }
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.size).toBe(0);
  });

  it('logs a regime-change and skips when |z| exceeds maxZScore', async () => {
    // Highly correlated series, A spikes at the end -> |z| > 4, corr > 0.6
    const regA = [0.494715, 0.489525, 0.504528, 0.487173, 0.501076, 0.495971, 0.48674, 0.500223, 0.486125, 0.498009, 0.487096, 0.487721, 0.497736, 0.509806, 0.488714, 0.491697, 0.503823, 0.513431, 0.502313, 0.4969, 0.525288];
    const regB = [0.492901, 0.490959, 0.503686, 0.48575, 0.499548, 0.495205, 0.488004, 0.498946, 0.486451, 0.498565, 0.486585, 0.487912, 0.495987, 0.508044, 0.487538, 0.492419, 0.503533, 0.512688, 0.502655, 0.496713, 0.513487];
    const strat = new PairsStatArbStrategy(makeDeps([], (tok, i) => (tok === 'yes-1' ? regA[i]! : regB[i]!)));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    for (let i = 0; i < 21; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanPair(a, b);
    }
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Spread extreme — regime change likely',
      'pairs-stat-arb',
      expect.objectContaining({ pair: 'a:b' }),
    );
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.size).toBe(0);
  });

  it('enters a short-spread position (buy B) when z > entryZScore', async () => {
    // Correlated series, A jumps at the end -> z = 2.376, corr = 0.993
    const sA = [0.494715, 0.489525, 0.504528, 0.487173, 0.501076, 0.495971, 0.48674, 0.500223, 0.486125, 0.498009, 0.487096, 0.487721, 0.497736, 0.509806, 0.488714, 0.491697, 0.503823, 0.513431, 0.502313, 0.4969, 0.516888];
    const sB = [0.492901, 0.490959, 0.503686, 0.48575, 0.499548, 0.495205, 0.488004, 0.498946, 0.486451, 0.498565, 0.486585, 0.487912, 0.495987, 0.508044, 0.487538, 0.492419, 0.503533, 0.512688, 0.502655, 0.496713, 0.513487];
    const strat = new PairsStatArbStrategy(makeDeps([], (tok, i) => (tok === 'yes-1' ? sA[i]! : sB[i]!)));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    for (let i = 0; i < 21; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanPair(a, b);
    }
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.get('a:b')).toBe('short');
    expect(strat.positions.length).toBe(1);
    expect(strat.positions[0]!.conditionId).toBe('b');
  });

  it('enters a long-spread position (buy A) when z < -entryZScore', async () => {
    // Same series as the short case but with B spiking at the end instead of A
    // -> spread inverts, z = -2.434, corr = 0.992
    const lA = [0.494715, 0.489525, 0.504528, 0.487173, 0.501076, 0.495971, 0.48674, 0.500223, 0.486125, 0.498009, 0.487096, 0.487721, 0.497736, 0.509806, 0.488714, 0.491697, 0.503823, 0.513431, 0.502313, 0.4969, 0.516888];
    const lB = [0.492901, 0.490959, 0.503686, 0.48575, 0.499548, 0.495205, 0.488004, 0.498946, 0.486451, 0.498565, 0.486585, 0.487912, 0.495987, 0.508044, 0.487538, 0.492419, 0.503533, 0.512688, 0.502655, 0.496713, 0.519365];
    const strat = new PairsStatArbStrategy(makeDeps([], (tok, i) => (tok === 'yes-1' ? lA[i]! : lB[i]!)));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    for (let i = 0; i < 21; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanPair(a, b);
    }
    // @ts-expect-error - reach into private field
    expect(strat.pairStatus.get('a:b')).toBe('long');
    expect(strat.positions.length).toBe(1);
    expect(strat.positions[0]!.conditionId).toBe('a');
  });

  it('does not re-enter when already on the same side', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [1.0, 0.996344, 0.999805, 1.002443, 0.999987, 0.999942, 0.999437, 1.000952, 1.003842, 0.999765, 0.995049, 0.99839, 0.997719, 1.000336, 0.995355, 0.994812, 0.997015, 0.994311, 1.028739, 1.032748, 1.028041]);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-2', [1.0, 0.996344, 0.999805, 1.002443, 0.999987, 0.999942, 0.999437, 1.000952, 1.003842, 0.999765, 0.995049, 0.99839, 0.997719, 1.000336, 0.995355, 0.994812, 0.997015, 0.994311, 0.998739, 1.002748, 0.998041]);
    // @ts-expect-error - reach into private field
    strat.pairStatus.set('a:b', 'short');
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    expect(strat.positions.length).toBe(0);
  });

  it('skips entry when the target market is on cooldown', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-1', [1.0, 0.996344, 0.999805, 1.002443, 0.999987, 0.999942, 0.999437, 1.000952, 1.003842, 0.999765, 0.995049, 0.99839, 0.997719, 1.000336, 0.995355, 0.994812, 0.997015, 0.994311, 1.028739, 1.032748, 1.028041]);
    // @ts-expect-error - reach into private field
    strat.priceHistory.set('yes-2', [1.0, 0.996344, 0.999805, 1.002443, 0.999987, 0.999942, 0.999437, 1.000952, 1.003842, 0.999765, 0.995049, 0.99839, 0.997719, 1.000336, 0.995355, 0.994812, 0.997015, 0.994311, 0.998739, 1.002748, 0.998041]);
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('b', Date.now() + 60_000);
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    // @ts-expect-error - call protected method for test
    await strat.scanPair(a, b);
    expect(strat.positions.length).toBe(0);
  });

  it('logs a pair-scan error without throwing', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    const a = makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' });
    const b = makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' });
    // Force getOrderBook to throw
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('boom'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanPair(a, b)).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Pair scan error',
      'pairs-stat-arb',
      expect.objectContaining({ pair: 'a:b' }),
    );
  });

  it('runs scanEntries over events and scans each pair', async () => {
    const events = [[
      makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' }),
      makeMarket({ conditionId: 'b', yesTokenId: 'yes-2' }),
      makeMarket({ conditionId: 'c', yesTokenId: 'yes-1' }),
    ]];
    const strat = new PairsStatArbStrategy(makeDeps(events));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([]);
    expect(strat.deps.gamma.getEvents).toHaveBeenCalledWith(DEFAULT_CONFIG.scanLimit);
  });

  it('skips events with fewer than 2 active markets', async () => {
    const events = [[makeMarket({ conditionId: 'a', yesTokenId: 'yes-1' })]];
    const strat = new PairsStatArbStrategy(makeDeps(events));
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([]);
    expect(strat.deps.gamma.getEvents).toHaveBeenCalled();
  });

  it('logs an events-fetch error without throwing', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    strat.deps.gamma.getEvents = vi.fn(async () => { throw new Error('down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Events fetch error',
      'pairs-stat-arb',
      expect.objectContaining({ err: 'Error: down' }),
    );
  });

  it('runs execute end-to-end and logs tick complete', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    await strat.execute();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Tick complete',
      'pairs-stat-arb',
      expect.objectContaining({ openPositions: 0, trackedPairs: 0 }),
    );
  });

  it('logs an error when execute throws', async () => {
    const strat = new PairsStatArbStrategy(makeDeps([]));
    strat.deps.gamma.getTrending = vi.fn(async () => { throw new Error('trend down'); });
    await expect(strat.execute()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Tick failed',
      'pairs-stat-arb',
      expect.objectContaining({ err: 'Error: trend down' }),
    );
  });
});
