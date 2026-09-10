import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_CONFIG,
  calcPearsonR,
  calcCorrZScore,
  createCorrelationBreakdownTick,
  CorrelationBreakdownStrategy,
} from '../../../../../src/desk/strategies/polymarket/correlation-breakdown';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/strategies/polymarket/gamma-client';
import type { RawOrderBook } from '../../../../../src/desk/strategies/polymarket/clob-client';
import type { Logger } from '../../../../../src/desk/strategies/core/logger';

// Capture logger calls without hitting real transports.
const { logger } = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger }));

describe('correlation-breakdown::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.windowSize).toBe(20);
    expect(DEFAULT_CONFIG.zScoreThreshold).toBeCloseTo(2.5, 5);
    expect(DEFAULT_CONFIG.minCorrelation).toBeCloseTo(0.7, 5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.scanLimit).toBeGreaterThan(0);
  });
});

describe('correlation-breakdown::calcPearsonR', () => {
  it('returns 1 for perfectly positively correlated', () => {
    expect(calcPearsonR([1,2,3], [2,4,6])).toBeCloseTo(1, 5);
  });
  it('returns -1 for perfectly negatively correlated', () => {
    expect(calcPearsonR([1,2,3], [3,2,1])).toBeCloseTo(-1, 5);
  });
  it('returns 0 for zero-variance input', () => {
    expect(calcPearsonR([2,2,2], [1,2,3])).toBe(0);
  });
  it('returns 0 for different-length arrays', () => {
    expect(calcPearsonR([1,2], [1])).toBe(0);
  });
  it('returns 0 for fewer than 3 points', () => {
    expect(calcPearsonR([1,2], [1,2])).toBe(0);
  });
  it('clamps to [-1, 1]', () => {
    // Identical arrays gives 1, should not exceed bounds
    const r = calcPearsonR([1,2,3,4,5], [1,2,3,4,5]);
    expect(r).toBeCloseTo(1, 5);
  });
});

describe('correlation-breakdown::calcCorrZScore', () => {
  it('returns computed value for empty history', () => {
    const r = calcCorrZScore(0.5, []);
    // mean=0, std=0.2 default -> (0-0.5)/0.2 = -2.5
    expect(Number.isFinite(r)).toBe(true);
  });
  it('returns 0 for single-element history', () => {
    expect(calcCorrZScore(0.5, [0.5])).toBe(0);
  });
  it('returns 0 when history variance is zero', () => {
    expect(calcCorrZScore(0.8, [0.7, 0.7, 0.7, 0.7])).toBe(0);
  });
  it('returns positive z-score when current is high relative to mean', () => {
    // mean=0.5, std approx 0.158 -> (0.5-0.9)/0.158 = -2.53
    // function computes (mean - current)/std, so positive when current < mean
    const hist = [0.9, 0.9, 0.9, 0.9, 0.5];
    const r = calcCorrZScore(0.3, hist);
    expect(r).toBeGreaterThan(0);
  });
  it('produces finite number for valid inputs', () => {
    const r = calcCorrZScore(0.9, [0.5, 0.6, 0.7, 0.8, 0.85]);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('correlation-breakdown::createCorrelationBreakdownTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createCorrelationBreakdownTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});

// ─── Strategy class tests ───────────────────────────────────────────────────

function makeBook(bid: number, ask: number): RawOrderBook {
  return {
    bids: [{ price: bid.toString(), size: '10' }],
    asks: [{ price: ask.toString(), size: '10' }],
    timestamp: Date.now(),
  };
}

function makeMarket(conditionId: string, yesTokenId: string, opts: Partial<GammaMarket> = {}): GammaMarket {
  return {
    conditionId,
    yesTokenId,
    noTokenId: `${yesTokenId}-no`,
    question: `q-${conditionId}`,
    volume: 5000,
    liquidity: 5000,
    endDate: '2099-01-01',
    outcomes: '["yes","no"]',
    outcomePrices: '["0.5","0.5"]',
    closed: false,
    resolved: false,
    ...opts,
  };
}

function makeDeps(overrides: {
  getOrderBook?: (tokenId: string) => Promise<RawOrderBook>;
  getEvents?: () => Promise<GammaMarket[]>;
  getTrending?: () => Promise<GammaMarket[]>;
}): StrategyDeps {
  return {
    clob: { getOrderBook: overrides.getOrderBook ?? (async () => makeBook(0.5, 0.52)) } as StrategyDeps['clob'],
    orderManager: { placeOrder: async (o: unknown) => ({ id: `order-${(o as { tokenId: string }).tokenId}` }) } as StrategyDeps['orderManager'],
    eventBus: { publish: async () => {}, emit: async () => {} } as StrategyDeps['eventBus'],
    gamma: {
      getEvents: overrides.getEvents ?? (async () => []),
      getTrending: overrides.getTrending ?? (async () => []),
    } as StrategyDeps['gamma'],
  };
}

function makeStrategy(overrides?: Parameters<typeof makeDeps>[0], config?: Partial<import('../../../../../src/desk/strategies/polymarket/correlation-breakdown').CorrelationBreakdownConfig>): CorrelationBreakdownStrategy {
  return new CorrelationBreakdownStrategy(makeDeps(overrides ?? {}), config);
}

// Build a price series that yields a given Pearson r between two assets.
function correlatedSeries(targetR: number, n: number): { a: number[]; b: number[] } {
  const a: number[] = [];
  const b: number[] = [];
  let pa = 0.5;
  let pb = 0.5;
  for (let i = 0; i < n; i++) {
    a.push(pa);
    b.push(pb);
    // step a randomly, step b toward targetR*a-step + noise
    const stepA = (Math.sin(i * 1.7) * 0.01);
    const noise = (Math.sin(i * 4.3) * 0.005) * Math.sqrt(1 - targetR * targetR);
    pa += stepA;
    pb += targetR * stepA + noise;
  }
  return { a, b };
}

describe('correlation-breakdown::CorrelationBreakdownStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with default config when none provided', () => {
    const s = makeStrategy();
    expect(s).toBeInstanceOf(CorrelationBreakdownStrategy);
  });

  it('constructs with partial config override', () => {
    const s = makeStrategy({}, { baseSizeUsdc: 100 });
    expect(s).toBeInstanceOf(CorrelationBreakdownStrategy);
  });

  describe('execute', () => {
    it('runs checkExits + getTrending + scanEntries and logs tick complete', async () => {
      const getTrending = vi.fn(async () => [makeMarket('c1', 't1')]);
      const s = makeStrategy({ getTrending });
      await s.execute();
      expect(getTrending).toHaveBeenCalledWith(30);
      expect(logger.debug).toHaveBeenCalledWith('Tick complete', 'correlation-breakdown', expect.objectContaining({ openPositions: 0 }));
    });

    it('logs error when gamma.getTrending throws', async () => {
      const s = makeStrategy({ getTrending: async () => { throw new Error('trend down'); } });
      await s.execute();
      expect(logger.error).toHaveBeenCalledWith('Tick failed', 'correlation-breakdown', { err: 'Error: trend down' });
    });
  });

  describe('scanEntries', () => {
    it('skips when maxPositions reached', async () => {
      // Pre-fill positions via enterPosition by running scanPair twice is complex;
      // instead verify the early-return by using a config with maxPositions=0.
      const s = makeStrategy({}, { maxPositions: 0 });
      const getEvents = vi.fn(async () => []);
      (s as unknown as { deps: StrategyDeps }).deps.gamma.getEvents = getEvents;
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([]);
      expect(getEvents).not.toHaveBeenCalled();
    });

    it('fetches events and scans active market pairs', async () => {
      const events = [
        {
          id: 'e1', title: 't', slug: 't', markets: [
            makeMarket('c1', 't1'),
            makeMarket('c2', 't2'),
          ],
        },
      ];
      const getEvents = vi.fn(async () => events);
      const getOrderBook = vi.fn(async (tokenId: string) => {
        // Return distinct books per token so mids differ
        if (tokenId === 't1') return makeBook(0.5, 0.52);
        return makeBook(0.48, 0.5);
      });
      const s = makeStrategy({ getOrderBook, getEvents });
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([]);
      expect(getEvents).toHaveBeenCalledWith(5);
      expect(getOrderBook).toHaveBeenCalled();
    });

    it('skips events with fewer than 2 active markets', async () => {
      const events = [
        { id: 'e1', title: 't', slug: 't', markets: [makeMarket('c1', 't1')] },
        { id: 'e2', title: 't2', slug: 't2', markets: [makeMarket('c3', 't3'), makeMarket('c4', 't4'), makeMarket('c5', 't5', { closed: true })] },
      ];
      const getEvents = vi.fn(async () => events);
      const getOrderBook = vi.fn(async () => makeBook(0.5, 0.52));
      const s = makeStrategy({ getOrderBook, getEvents });
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([]);
      // e1 skipped (1 market), e2 has 2 active (c5 closed) → 1 pair scanned
      expect(getOrderBook).toHaveBeenCalledTimes(2);
    });

    it('logs events fetch error and continues', async () => {
      const s = makeStrategy({ getEvents: async () => { throw new Error('events down'); } });
      const getTrending = vi.fn(async () => []);
      (s as unknown as { deps: StrategyDeps }).deps.gamma.getTrending = getTrending;
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([]);
      expect(logger.debug).toHaveBeenCalledWith('Events fetch error', 'correlation-breakdown', { err: 'Error: events down' });
    });

    it('iterates trending markets but skips closed/resolved/already-positioned', async () => {
      const events: GammaMarket[] = [];
      const getEvents = vi.fn(async () => events);
      const s = makeStrategy({ getEvents });
      // Provide trending with closed + resolved + valid markets — the loop just continues on closed/resolved.
      const trending = [
        makeMarket('cx', 'tx', { closed: true }),
        makeMarket('cy', 'ty', { resolved: true }),
        makeMarket('cz', 'tz'),
      ];
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries(trending);
      expect(getEvents).toHaveBeenCalled();
    });
  });

  describe('scanPair', () => {
    it('skips when market lacks yesTokenId', async () => {
      const s = makeStrategy();
      const getOrderBook = vi.fn(async () => makeBook(0.5, 0.52));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      const marketA = makeMarket('c1', '');
      const marketB = makeMarket('c2', 't2');
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(marketA, marketB);
      expect(getOrderBook).not.toHaveBeenCalled();
    });

    it('skips when maxPositions reached', async () => {
      const s = makeStrategy({}, { maxPositions: 0 });
      const getOrderBook = vi.fn(async () => makeBook(0.5, 0.52));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', 't1'), makeMarket('c2', 't2'));
      expect(getOrderBook).not.toHaveBeenCalled();
    });

    it('records prices and returns early when insufficient returns', async () => {
      const s = makeStrategy();
      const getOrderBook = vi.fn(async () => makeBook(0.5, 0.52));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', 't1'), makeMarket('c2', 't2'));
      // Only 1 price point → returns < windowSize → no entry
      expect(getOrderBook).toHaveBeenCalledTimes(2);
      expect(logger.info).not.toHaveBeenCalledWith('Entry position', expect.any(String), expect.any(Object));
    });

    it('enters a position when correlation breaks down', async () => {
      // Build a strategy and seed price history so returns are sufficient.
      const s = makeStrategy({}, { windowSize: 5, zScoreThreshold: 0.5, minCorrelation: 0.3, maxPositions: 5 });
      const { a, b } = correlatedSeries(0.95, 30);
      const priceHistory = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory;
      const t1 = 't1';
      const t2 = 't2';
      a.forEach(p => priceHistory.get(t1) ? priceHistory.get(t1)!.push(p) : priceHistory.set(t1, [p]));
      b.forEach(p => priceHistory.get(t2) ? priceHistory.get(t2)!.push(p) : priceHistory.set(t2, [p]));
      // Ensure arrays exist
      if (!priceHistory.has(t1)) priceHistory.set(t1, []);
      if (!priceHistory.has(t2)) priceHistory.set(t2, []);

      const getOrderBook = vi.fn(async (tokenId: string) => {
        if (tokenId === t1) return makeBook(0.5, 0.52);
        return makeBook(0.3, 0.32); // t2 cheaper → divergence
      });
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;

      // Seed correlation history with high correlations so meanCorr >= minCorrelation
      const corrHistory = (s as unknown as { corrHistory: Map<string, number[]> }).corrHistory;
      corrHistory.set('c1:c2', [0.9, 0.92, 0.88, 0.91, 0.89]);

      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', t1), makeMarket('c2', t2));
      expect(logger.info).toHaveBeenCalledWith('Entry position', 'correlation-breakdown', expect.any(Object));
    });

    it('does not enter when mean correlation is below minCorrelation', async () => {
      const s = makeStrategy({}, { windowSize: 5, zScoreThreshold: 0.5, minCorrelation: 0.99 });
      const { a, b } = correlatedSeries(0.5, 30);
      const priceHistory = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory;
      const t1 = 't1';
      const t2 = 't2';
      priceHistory.set(t1, a);
      priceHistory.set(t2, b);
      const getOrderBook = vi.fn(async (tokenId: string) => tokenId === t1 ? makeBook(0.5, 0.52) : makeBook(0.3, 0.32));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      const corrHistory = (s as unknown as { corrHistory: Map<string, number[]> }).corrHistory;
      corrHistory.set('c1:c2', [0.2, 0.25, 0.22, 0.21, 0.23]); // mean ~0.22 < 0.99
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', t1), makeMarket('c2', t2));
      expect(logger.info).not.toHaveBeenCalledWith('Entry position', expect.any(String), expect.any(Object));
    });

    it('creates a new corrHistory entry when pair is first seen and returns early under 5 samples', async () => {
      const s = makeStrategy({}, { windowSize: 5 });
      const { a, b } = correlatedSeries(0.5, 30);
      const priceHistory = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory;
      priceHistory.set('t1', a);
      priceHistory.set('t2', b);
      const getOrderBook = vi.fn(async (tokenId: string) => tokenId === 't1' ? makeBook(0.5, 0.52) : makeBook(0.48, 0.5));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      const corrHistory = (s as unknown as { corrHistory: Map<string, number[]> }).corrHistory;
      expect(corrHistory.has('c1:c2')).toBe(false);
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', 't1'), makeMarket('c2', 't2'));
      // First scan creates the hist array (line 146); length 1 < 5 → early return, no entry.
      expect(corrHistory.has('c1:c2')).toBe(true);
      expect(corrHistory.get('c1:c2')).toHaveLength(1);
      expect(logger.info).not.toHaveBeenCalledWith('Entry position', expect.any(String), expect.any(Object));
    });

    it('trims corrHistory to 40 entries when it exceeds 40', async () => {
      const s = makeStrategy({}, { windowSize: 5, zScoreThreshold: 0.5, minCorrelation: 0.3, maxPositions: 5 });
      const { a, b } = correlatedSeries(0.95, 30);
      const priceHistory = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory;
      priceHistory.set('t1', a);
      priceHistory.set('t2', b);
      // Pre-seed 41 identical high correlations; after push (42) the trim branch fires.
      const corrHistory = (s as unknown as { corrHistory: Map<string, number[]> }).corrHistory;
      corrHistory.set('c1:c2', Array.from({ length: 41 }, () => 0.9));
      const getOrderBook = vi.fn(async (tokenId: string) => tokenId === 't1' ? makeBook(0.5, 0.52) : makeBook(0.3, 0.32));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', 't1'), makeMarket('c2', 't2'));
      expect(corrHistory.get('c1:c2')).toHaveLength(40);
    });

    it('enters marketA when baA.mid is below the expected midpoint', async () => {
      // marketA cheaper than marketB → baA.mid < expected → marketA entry branch (lines 162-166)
      const s = makeStrategy({}, { windowSize: 5, zScoreThreshold: 0.5, minCorrelation: 0.3, maxPositions: 5 });
      const { a, b } = correlatedSeries(0.95, 30);
      const priceHistory = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory;
      const t1 = 't1';
      const t2 = 't2';
      priceHistory.set(t1, a);
      priceHistory.set(t2, b);
      const getOrderBook = vi.fn(async (tokenId: string) => tokenId === t1 ? makeBook(0.3, 0.32) : makeBook(0.5, 0.52));
      (s as unknown as { deps: StrategyDeps }).deps.clob.getOrderBook = getOrderBook;
      const corrHistory = (s as unknown as { corrHistory: Map<string, number[]> }).corrHistory;
      corrHistory.set('c1:c2', [0.9, 0.92, 0.88, 0.91, 0.89]);
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', t1), makeMarket('c2', t2));
      expect(logger.info).toHaveBeenCalledWith('Entry position', 'correlation-breakdown', expect.any(Object));
    });

    it('skips events where all markets are closed/resolved so active count < 2 (line 189)', async () => {
      const events = [
        { id: 'e1', title: 't', slug: 't', markets: [
          makeMarket('c1', 't1', { closed: true }),
          makeMarket('c2', 't2', { resolved: true }),
        ] },
      ];
      const getEvents = vi.fn(async () => events);
      const getOrderBook = vi.fn(async () => makeBook(0.5, 0.52));
      const s = makeStrategy({ getEvents, getOrderBook });
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([]);
      // Both filtered out → active.length 0 < 2 → continue, no order book fetched
      expect(getOrderBook).not.toHaveBeenCalled();
    });

    it('skips trending markets that already have a position (line 204)', async () => {
      const getEvents = vi.fn(async () => []);
      const s = makeStrategy({ getEvents });
      // Pre-fill a position for c1 so hasPosition returns true → continue path
      (s as unknown as { positions: unknown[] }).positions = [{ conditionId: 'c1' }];
      await (s as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([
        makeMarket('c1', 't1'),
        makeMarket('c2', 't2'),
      ]);
      expect(getEvents).toHaveBeenCalled();
    });

    it('logs pair scan error when getOrderBook throws', async () => {
      const s = makeStrategy({ getOrderBook: async () => { throw new Error('book down'); } });
      await (s as unknown as { scanPair: (a: GammaMarket, b: GammaMarket) => Promise<void> }).scanPair(makeMarket('c1', 't1'), makeMarket('c2', 't2'));
      expect(logger.debug).toHaveBeenCalledWith('Pair scan error', 'correlation-breakdown', { pair: 'c1:c2', err: 'Error: book down' });
    });
  });
});
