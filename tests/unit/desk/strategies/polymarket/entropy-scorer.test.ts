/**
 * Tests for entropy-scorer — pure helpers (computeEntropy, computeBias, getDirection)
 * plus the strategy class driven through scanEntries/getCustomExitCondition/execute
 * with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  computeEntropy,
  computeBias,
  getDirection,
  EntropyScorerStrategy,
  DEFAULT_CONFIG,
  createEntropyScorerTick,
} from '../../../../../src/desk/strategies/polymarket/entropy-scorer';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';
import type { OpenPosition } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('entropy-scorer::computeEntropy', () => {
  it('returns near-0 for clamped p=0 and p=1', () => {
    const r0 = computeEntropy(0);
    const r1 = computeEntropy(1);
    expect(r0).toBeGreaterThan(0);
    expect(r0).toBeLessThan(0.1);
    expect(r1).toBeGreaterThan(0);
    expect(r1).toBeLessThan(0.1);
  });

  it('returns 1 for p=0.5 (max uncertainty)', () => {
    expect(computeEntropy(0.5)).toBeCloseTo(1, 5);
  });

  it('returns value between 0 and 1 for valid probabilities', () => {
    const r = computeEntropy(0.7);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });

  it('clamps extreme negative inputs to valid range', () => {
    const r = computeEntropy(-1);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.1);
  });

  it('clamps extreme positive inputs to valid range', () => {
    const r = computeEntropy(2);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.1);
  });

  it('is symmetric around 0.5', () => {
    expect(computeEntropy(0.3)).toBeCloseTo(computeEntropy(0.7), 10);
    expect(computeEntropy(0.1)).toBeCloseTo(computeEntropy(0.9), 10);
  });

  it('returns 0 for exactly 0 or 1 after clamping', () => {
    // The clamp is 0.001/0.999 so entropy won't be exactly 0
    const r0 = computeEntropy(0.001);
    const r1 = computeEntropy(0.999);
    expect(r0).toBeLessThan(0.02);
    expect(r1).toBeLessThan(0.02);
  });
});

describe('entropy-scorer::computeBias', () => {
  it('returns 0 at p=0.5', () => {
    expect(computeBias(0.5)).toBe(0);
  });

  it('returns 1 at p=0 or p=1', () => {
    expect(computeBias(0)).toBe(1);
    expect(computeBias(1)).toBe(1);
  });

  it('returns 0.6 at p=0.8', () => {
    expect(computeBias(0.8)).toBeCloseTo(0.6, 5);
  });

  it('returns 0.6 at p=0.2 (symmetry)', () => {
    expect(computeBias(0.2)).toBeCloseTo(0.6, 5);
  });

  it('is symmetric around 0.5', () => {
    expect(computeBias(0.3)).toBeCloseTo(computeBias(0.7), 10);
    expect(computeBias(0.1)).toBeCloseTo(computeBias(0.9), 10);
  });

  it('increases linearly with distance from 0.5', () => {
    expect(computeBias(0.75)).toBeCloseTo(0.5, 5);
    expect(computeBias(0.25)).toBeCloseTo(0.5, 5);
  });
});

describe('entropy-scorer::getDirection', () => {
  it('returns yes for p > 0.5 with sufficient bias', () => {
    expect(getDirection(0.9)).toBe('yes');
  });

  it('returns no for p < 0.5 with sufficient bias', () => {
    expect(getDirection(0.1)).toBe('no');
  });

  it('returns null at exactly 0.5', () => {
    expect(getDirection(0.5)).toBeNull();
  });

  it('returns null when bias < 0.05', () => {
    // p=0.52 -> bias = 0.04 < 0.05
    expect(getDirection(0.52)).toBeNull();
  });

  it('returns null when bias < 0.05 on low side', () => {
    // p=0.48 -> bias = 0.04 < 0.05
    expect(getDirection(0.48)).toBeNull();
  });

  it('returns yes for p=0.53 (bias = 0.06)', () => {
    expect(getDirection(0.53)).toBe('yes');
  });

  it('returns no for p=0.47 (bias = 0.06)', () => {
    expect(getDirection(0.47)).toBe('no');
  });
});

// ── Test fixtures ────────────────────────────────────────────────────────────

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
    resolved: false,
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

function makePosition(overrides: Partial<OpenPosition> = {}): OpenPosition {
  return {
    tokenId: 'yes-1',
    conditionId: 'c-1',
    side: 'yes',
    entryPrice: 0.5,
    sizeUsdc: 20,
    orderId: 'o-1',
    openedAt: Date.now(),
    ...overrides,
  };
}

// ── Strategy class ──────────────────────────────────────────────────────────

describe('EntropyScorerStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.5 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.entropyThreshold).toBe(0.5);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.minBias).toBe(DEFAULT_CONFIG.minBias);
  });

  describe('getCustomExitCondition', () => {
    it('returns exit when entropy rises above threshold', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7 });
      const pos = makePosition({ side: 'yes' });
      // currentPrice 0.8 -> entropy = computeEntropy(0.8) ≈ 0.72 > 0.7
      const result = strat.getCustomExitCondition(pos, 0.8);
      expect(result.exit).toBe(true);
      expect(result.reason).toContain('entropy-rising');
    });

    it('returns no exit when entropy is below threshold for yes side', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7 });
      const pos = makePosition({ side: 'yes' });
      // currentPrice 0.6 -> entropy = computeEntropy(0.6) ≈ 0.97 but wait, 0.6 is close to 0.5
      // Actually entropy(0.6) = 0.97... wait let me compute: p=0.6, q=0.4
      // -(0.6*ln(0.6) + 0.4*ln(0.4))/ln(2) = -(0.6*-0.51 + 0.4*-0.916)/0.693 = 0.97
      // That's actually > 0.7. Let me use a price closer to 0.5 or 1.0
      // p=0.9 -> entropy = computeEntropy(0.9) = -(0.9*ln(0.9)+0.1*ln(0.1))/ln(2) ≈ 0.469 < 0.7
      const result = strat.getCustomExitCondition(pos, 0.9);
      expect(result.exit).toBe(false);
      expect(result.reason).toBe('');
    });

    it('returns exit when entropy rises above threshold for no side', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7 });
      const pos = makePosition({ side: 'no' });
      // For 'no' side, price is inverted: 1 - currentPrice
      // currentPrice 0.2 -> inverted = 0.8 -> entropy ≈ 0.72 > 0.7
      const result = strat.getCustomExitCondition(pos, 0.2);
      expect(result.exit).toBe(true);
      expect(result.reason).toContain('entropy-rising');
    });

    it('returns no exit when entropy below threshold for no side', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7 });
      const pos = makePosition({ side: 'no' });
      // currentPrice 0.9 -> inverted = 0.1 -> entropy = computeEntropy(0.1) ≈ 0.469 < 0.7
      const result = strat.getCustomExitCondition(pos, 0.9);
      expect(result.exit).toBe(false);
    });

    it('uses the correct threshold from config', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.5 });
      const pos = makePosition({ side: 'yes' });
      // p=0.6 -> entropy ≈ 0.97 > 0.5
      const result = strat.getCustomExitCondition(pos, 0.6);
      expect(result.exit).toBe(true);
    });
  });

  describe('scanEntries', () => {
    it('skips markets with no yesTokenId', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips closed markets', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket({ closed: true })]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips resolved markets', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket({ resolved: true })]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets already holding a position', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      // @ts-expect-error - reach into private field
      strat.positions.push(makePosition({ conditionId: 'c-1' }));
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket()]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets on cooldown', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      // @ts-expect-error - reach into private field
      strat.cooldowns.set('c-1', Date.now() + 60_000);
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket()]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('does not scan when already at max positions', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { maxPositions: 2 });
      // @ts-expect-error - reach into private field
      strat.positions.push(
        makePosition({ tokenId: 't1', conditionId: 'c1' }),
        makePosition({ tokenId: 't2', conditionId: 'c2' }),
      );
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket({ conditionId: 'c-3' })]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets below minVolume', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { minVolume: 2000 });
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([makeMarket({ volume: 500 })]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips entry when entropy history is below 3 entries', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { lookback: 5 });
      const m = makeMarket({ volume: 2000 });
      // Only 2 scans — below 3, no entry
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('skips when recent entropy average is above threshold', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000, yesTokenId: 'yes-1' });
      // Force high entropy (price near 0.5) for 3 scans
      const highEntropyPrice = 0.51; // entropy ~0.99
      const deps = makeDeps(() => highEntropyPrice);
      strat.deps = deps;
      for (let i = 0; i < 3; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('skips when bias is below minBias', async () => {
      const m = makeMarket({ volume: 2000 });
      // Need recentEntropy < threshold (avg of last 3) but current bias < minBias.
      // entropy(0.9)=0.469, entropy(0.53)=0.997. Avg(0.9,0.9,0.53)=0.645<0.7; bias(0.53)=0.06<0.15
      const deps = makeDeps((_, i) => (i < 2 ? 0.9 : 0.53));
      const strat = new EntropyScorerStrategy(deps, { entropyThreshold: 0.7, minBias: 0.15 });
      for (let i = 0; i < 3; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('enters "yes" when entropy is low and bias is high (upward consensus)', async () => {
      const m = makeMarket({ volume: 2000 });
      // Price = 0.85 -> bias = 0.7 > 0.15, entropy = computeEntropy(0.85) ≈ 0.61 < 0.7
      const highConsensusPrice = 0.85;
      const deps = makeDeps(() => highConsensusPrice);
      const strat = new EntropyScorerStrategy(deps, { entropyThreshold: 0.7, minBias: 0.15 });
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(1);
      // @ts-expect-error - reach into private field
      expect(strat.positions[0]!.side).toBe('yes');
      expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Entropy entry',
        'entropy-scorer',
        expect.objectContaining({ conditionId: 'c-1', side: 'yes' }),
      );
    });

    it('enters "no" when entropy is low and bias is high downward (downward consensus)', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000 });
      // Price = 0.15 -> bias = 0.7 > 0.15, entropy = computeEntropy(0.15) ≈ 0.61 < 0.7
      const lowConsensusPrice = 0.15;
      const deps = makeDeps(() => lowConsensusPrice);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(1);
      // @ts-expect-error - reach into private field
      expect(strat.positions[0]!.side).toBe('no');
    });

    it('uses noTokenId for "no" side entry', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000, noTokenId: 'no-1' });
      const lowConsensusPrice = 0.15;
      const deps = makeDeps(() => lowConsensusPrice);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions[0]!.tokenId).toBe('no-1');
    });

    it('falls back to yesTokenId when noTokenId is missing for "no" side', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000, noTokenId: undefined });
      const lowConsensusPrice = 0.15;
      const deps = makeDeps(() => lowConsensusPrice);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions[0]!.tokenId).toBe('yes-1');
    });

    it('skips entry when calculated entryPrice is invalid (<= 0 or >= 1)', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000 });
      // Price that makes entryPrice invalid
      // For "yes": entryPrice = ask (mid + 0.01). If mid = 0.99, ask = 1.0 -> invalid
      // For "no": entryPrice = 1 - bid = 1 - (mid - 0.01). If mid = 0.01, bid = 0.00 -> entry = 1.0 -> invalid
      const invalidPrice = 0.99;
      const deps = makeDeps(() => invalidPrice);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('logs a scan error without throwing', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
      // @ts-expect-error - call protected method for test
      await expect(strat.scanEntries([makeMarket({ volume: 2000 })])).resolves.toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Entropy scan error',
        'entropy-scorer',
        expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
      );
    });

    it('trims entropy history when it exceeds lookback * 3', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { lookback: 2, entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000 });
      const price = 0.85;
      const deps = makeDeps(() => price);
      strat.deps = deps;
      // Scan 10 times - history should be trimmed to 6 (2*3)
      for (let i = 0; i < 10; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      const hist = strat.entropyHistory.get('c-1');
      expect(hist).toBeDefined();
      expect(hist!.length).toBeLessThanOrEqual(6);
    });

    it('skips market when mid price is <= 0', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000 });
      const deps = makeDeps(() => 0); // mid = 0
      strat.deps = deps;
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('skips market when mid price is >= 1', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m = makeMarket({ volume: 2000 });
      const deps = makeDeps(() => 1); // mid = 1
      strat.deps = deps;
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('skips market below minVolume', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { minVolume: 5000 });
      const m = makeMarket({ volume: 1000 });
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('trims history correctly when exceeding lookback * 3', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { lookback: 2 });
      const m = makeMarket({ volume: 2000 });
      const deps = makeDeps(() => 0.5);
      strat.deps = deps;
      // Scan 8 times - history should be trimmed to 6 (2*3)
      for (let i = 0; i < 8; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      const hist = strat.entropyHistory.get('c-1');
      expect(hist).toBeDefined();
      expect(hist!.length).toBe(6);
    });

    it('skips entry when getDirection returns null (bias < 0.05)', async () => {
      const m = makeMarket({ volume: 2000 });
      // Need recentEntropy < threshold but bias < 0.05 so getDirection returns null
      // entropy(0.9)=0.469, entropy(0.52)=0.998. Avg(0.9,0.9,0.52)=0.646<0.7; bias(0.52)=0.04<0.05
      const deps = makeDeps((_, i) => (i < 2 ? 0.9 : 0.52));
      const strat = new EntropyScorerStrategy(deps, { entropyThreshold: 0.7, minBias: 0.01 });
      for (let i = 0; i < 3; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });

    it('handles multiple markets in single scanEntries call', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { entropyThreshold: 0.7, minBias: 0.15 });
      const m1 = makeMarket({ conditionId: 'c-1', volume: 2000 });
      const m2 = makeMarket({ conditionId: 'c-2', volume: 2000, yesTokenId: 'yes-2' });
      const deps = makeDeps(() => 0.85);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m1, m2]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(2);
    });

    it('breaks out of market loop when maxPositions reached mid-scan', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { maxPositions: 1, entropyThreshold: 0.7, minBias: 0.15 });
      const m1 = makeMarket({ conditionId: 'c-1', volume: 2000 });
      const m2 = makeMarket({ conditionId: 'c-2', volume: 2000, yesTokenId: 'yes-2' });
      const deps = makeDeps(() => 0.85);
      strat.deps = deps;
      for (let i = 0; i < 4; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m1, m2]);
      }
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(1);
    });

    it('skips market with undefined volume (uses ?? 0)', async () => {
      const strat = new EntropyScorerStrategy(makeDeps(), { minVolume: 100 });
      const m = makeMarket({ volume: undefined as unknown as number });
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
      // @ts-expect-error - reach into private field
      expect(strat.positions.length).toBe(0);
    });
  });

  describe('execute', () => {
    it('runs execute end-to-end without throwing', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      await expect(strat.execute()).resolves.toBeUndefined();
    });

    it('calls checkExits and scanEntries during execute', async () => {
      const strat = new EntropyScorerStrategy(makeDeps());
      const checkExitsSpy = vi.spyOn(strat, 'checkExits' as any);
      const scanEntriesSpy = vi.spyOn(strat, 'scanEntries' as any);
      await strat.execute();
      expect(checkExitsSpy).toHaveBeenCalledTimes(1);
      expect(scanEntriesSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('legacy factory', () => {
    it('creates a tick function via the legacy factory', () => {
      const tick = createEntropyScorerTick(makeDeps());
      expect(typeof tick).toBe('function');
    });

    it('tick function calls execute', async () => {
      const tick = createEntropyScorerTick(makeDeps());
      await expect(tick()).resolves.toBeUndefined();
    });
  });
});

describe('entropy-scorer::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.entropyThreshold).toBeCloseTo(0.7, 5);
    expect(DEFAULT_CONFIG.minBias).toBeCloseTo(0.15, 5);
    expect(DEFAULT_CONFIG.lookback).toBe(5);
    expect(DEFAULT_CONFIG.minVolume).toBe(1000);
    expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.04);
    expect(DEFAULT_CONFIG.stopLossPct).toBe(0.025);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(10 * 60_000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(4);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(60_000);
    expect(DEFAULT_CONFIG.positionSize).toBe('12');
  });
});