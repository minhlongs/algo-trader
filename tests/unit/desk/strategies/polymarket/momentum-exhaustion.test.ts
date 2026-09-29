/**
 * Tests for momentum-exhaustion — pure helpers (calcVelocity, calcVolumeRate,
 * calcATR, detectExhaustion) plus the strategy class driven through
 * scanEntries with mocked deps (clob/orderManager/eventBus/gamma).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  calcVelocity, calcVolumeRate, calcATR, detectExhaustion,
  MomentumExhaustionStrategy, DEFAULT_CONFIG, createMomentumExhaustionTick,
} from '../../../../../src/desk/strategies/polymarket/momentum-exhaustion';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('momentum-exhaustion::calcVelocity', () => {
  it('returns 0 when fewer than window+1 values', () => {
    expect(calcVelocity([1, 2, 3], 5)).toBe(0);
  });

  it('computes mean rate of change over the window', () => {
    // values[9] - values[4] over window 5
    const v = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    expect(calcVelocity(v, 5)).toBeCloseTo((1.0 - 0.5) / 5, 10);
  });

  it('returns a negative velocity for a downtrend', () => {
    const v = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5];
    expect(calcVelocity(v, 5)).toBeCloseTo((0.5 - 1.0) / 5, 10);
  });
});

describe('momentum-exhaustion::calcVolumeRate', () => {
  it('returns 0 when fewer than window+1 values', () => {
    expect(calcVolumeRate([100, 200], 5)).toBe(0);
  });

  it('computes mean volume delta over the window', () => {
    const vols = [100, 100, 100, 100, 100, 200];
    expect(calcVolumeRate(vols, 5)).toBeCloseTo((200 - 100) / 5, 10);
  });
});

describe('momentum-exhaustion::calcATR', () => {
  it('returns 0 when fewer than period+1 prices', () => {
    expect(calcATR([0.5, 0.6], 5)).toBe(0);
  });

  it('computes average true range from mid-price snapshots', () => {
    // period 2: |0.6-0.5| + |0.7-0.6| = 0.2, /2 = 0.1
    expect(calcATR([0.5, 0.6, 0.7], 2)).toBeCloseTo(0.1, 10);
  });
});

describe('momentum-exhaustion::detectExhaustion', () => {
  it('returns null when velocity magnitude is below threshold', () => {
    expect(detectExhaustion(0.0001, 0.001, 100)).toBeNull();
  });

  it('returns null when volume rate is not positive', () => {
    expect(detectExhaustion(0.01, 0.02, 0)).toBeNull();
    expect(detectExhaustion(0.01, 0.02, -5)).toBeNull();
  });

  it('returns "no" for up-trend exhaustion (velocity decelerating)', () => {
    // priceVel > 0 but < prevPriceVel, volume rising
    expect(detectExhaustion(0.005, 0.01, 100)).toBe('no');
  });

  it('returns "yes" for down-trend exhaustion (velocity improving)', () => {
    // priceVel < 0 but > prevPriceVel, volume rising
    expect(detectExhaustion(-0.005, -0.01, 100)).toBe('yes');
  });

  it('returns null when velocity is accelerating (no exhaustion)', () => {
    // priceVel > 0 and > prevPriceVel — still accelerating up
    expect(detectExhaustion(0.02, 0.01, 100)).toBeNull();
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

describe('MomentumExhaustionStrategy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges config with DEFAULT_CONFIG', () => {
    const strat = new MomentumExhaustionStrategy(makeDeps(), { atrPeriod: 12 });
    // @ts-expect-error - reach into private field
    expect(strat.cfg.atrPeriod).toBe(12);
    // @ts-expect-error - reach into private field
    expect(strat.cfg.velocityWindow).toBe(DEFAULT_CONFIG.velocityWindow);
  });

  it('skips markets with no yesTokenId', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ yesTokenId: '' })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed or resolved markets', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ closed: true })]);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ resolved: true })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets already holding a position', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.positions.push(
      { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() },
    );
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets on cooldown', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    // @ts-expect-error - reach into private field
    strat.cooldowns.set('c-1', Date.now() + 60_000);
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket()]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('does not scan when already at max positions', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
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

  it('skips markets below minVolume', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    // @ts-expect-error - call protected method for test
    await strat.scanEntries([makeMarket({ volume: 500 })]);
    expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips entry when price history is below velocityWindow+2', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    const m = makeMarket({ volume: 2000 });
    // Only 3 ticks — below velocityWindow+2 (7), no entry
    for (let i = 0; i < 3; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([m]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(0);
  });

  it('enters "no" on up-trend exhaustion (decelerating velocity + rising volume)', async () => {
    // Prices rise but the marginal gain shrinks each tick; volume rises each tick.
    const strat = new MomentumExhaustionStrategy(makeDeps((_t, i) => 0.50 + 0.01 * i - Math.max(0, i - 5) * 0.009));
    const marketAt = (i: number) => makeMarket({ volume: 2000 + 100 * i });
    for (let i = 0; i < 8; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([marketAt(i)]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('no');
    expect(strat.deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Exhaustion entry',
      'momentum-exhaustion',
      expect.objectContaining({ conditionId: 'c-1', side: 'no' }),
    );
  });

  it('enters "yes" on down-trend exhaustion', async () => {
    // Prices fall but the marginal loss shrinks each tick; volume rises each tick.
    const strat = new MomentumExhaustionStrategy(makeDeps((_t, i) => 0.70 - 0.01 * i + Math.max(0, i - 5) * 0.009));
    const marketAt = (i: number) => makeMarket({ volume: 2000 + 100 * i });
    for (let i = 0; i < 8; i++) {
      // @ts-expect-error - call protected method for test
      await strat.scanEntries([marketAt(i)]);
    }
    // @ts-expect-error - reach into private field
    expect(strat.positions.length).toBe(1);
    // @ts-expect-error - reach into private field
    expect(strat.positions[0]!.side).toBe('yes');
  });

  it('logs a scan error without throwing', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    strat.deps.clob.getOrderBook = vi.fn(async () => { throw new Error('book down'); });
    // @ts-expect-error - call protected method for test
    await expect(strat.scanEntries([makeMarket({ volume: 2000 })])).resolves.toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Scan error',
      'momentum-exhaustion',
      expect.objectContaining({ market: 'c-1', err: 'Error: book down' }),
    );
  });

  it('runs execute end-to-end', async () => {
    const strat = new MomentumExhaustionStrategy(makeDeps());
    await expect(strat.execute()).resolves.toBeUndefined();
  });

  it('creates a tick function via the legacy factory', () => {
    const tick = createMomentumExhaustionTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  describe('recordTick trimming', () => {
    it('trims price and volume arrays when exceeding maxLen', async () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), {
        velocityWindow: 2,
        atrPeriod: 2,
      });
      // maxLen = Math.max(2, 2) * 4 = 8
      const m = makeMarket({ volume: 3000 });
      for (let i = 0; i < 15; i++) {
        // @ts-expect-error - call protected method for test
        await strat.scanEntries([m]);
      }
      // @ts-expect-error - reach into private field
      const prices = strat.priceHistory.get('yes-1');
      // @ts-expect-error - reach into private field
      const vols = strat.volumeHistory.get('yes-1');
      expect(prices?.length).toBe(8);
      expect(vols?.length).toBe(8);
    });
  });

  describe('getCustomExitCondition', () => {
    it('returns no exit when no price history exists', () => {
      const strat = new MomentumExhaustionStrategy(makeDeps());
      const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
      // @ts-expect-error - call protected method
      const res = strat.getCustomExitCondition(pos, 0.5);
      expect(res).toEqual({ exit: false, reason: '' });
    });

    it('returns no exit when volume history is missing or price length is insufficient', () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), { velocityWindow: 5 });
      const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.5, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
      // @ts-expect-error - access private
      strat.priceHistory.set('yes-1', [0.5, 0.51, 0.52]);
      // vols missing
      // @ts-expect-error - call protected method
      expect(strat.getCustomExitCondition(pos, 0.5)).toEqual({ exit: false, reason: '' });

      // vols present but prices too short (< velocityWindow + 1 = 6)
      // @ts-expect-error - access private
      strat.volumeHistory.set('yes-1', [100, 200, 300]);
      // @ts-expect-error - call protected method
      expect(strat.getCustomExitCondition(pos, 0.5)).toEqual({ exit: false, reason: '' });
    });

    it('triggers ATR stop loss exit when price move exceeds atr * atrStopMultiplier', () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), {
        velocityWindow: 2,
        atrPeriod: 2,
        atrStopMultiplier: 2.0,
      });
      const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.50, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
      // ATR with period 2 on [0.50, 0.52, 0.54]: (|0.52-0.50| + |0.54-0.52|) / 2 = 0.02
      // ATR stop distance = 0.02 * 2.0 = 0.04
      // @ts-expect-error - access private
      strat.priceHistory.set('yes-1', [0.50, 0.52, 0.54]);
      // @ts-expect-error - access private
      strat.volumeHistory.set('yes-1', [1000, 1000, 1000]);

      // Price move: |0.45 - 0.50| = 0.05 > 0.04 -> triggers ATR stop
      // @ts-expect-error - call protected method
      const res = strat.getCustomExitCondition(pos, 0.45);
      expect(res.exit).toBe(true);
      expect(res.reason).toContain('atr-stop');
    });

    it('triggers opposite exhaustion exit when detectExhaustion returns opposite side', () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), {
        velocityWindow: 2,
        atrPeriod: 2,
        atrStopMultiplier: 10.0, // High so ATR stop doesn't trigger
      });
      // Position is 'yes'. We want an exhaustion signal of 'no' (uptrend exhaustion)
      const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.50, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
      // priceVel = (0.55 - 0.50) / 2 = 0.025 > 0
      // prevVel = 0.05 > priceVel (decelerating uptrend)
      // volumeRate = (3000 - 1000) / 2 = 1000 > 0
      // -> signal is 'no' (opposite of pos.side 'yes')
      // @ts-expect-error - access private
      strat.priceHistory.set('yes-1', [0.50, 0.53, 0.55]);
      // @ts-expect-error - access private
      strat.volumeHistory.set('yes-1', [1000, 2000, 3000]);
      // @ts-expect-error - access private
      strat.prevVelocity.set('yes-1', 0.05);

      // @ts-expect-error - call protected method
      const res = strat.getCustomExitCondition(pos, 0.55);
      expect(res.exit).toBe(true);
      expect(res.reason).toBe('opposite-exhaustion (signal=no)');
    });

    it('falls back to priceVel when prevVelocity is not yet cached and returns no exit if no exhaustion', () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), {
        velocityWindow: 2,
        atrPeriod: 2,
        atrStopMultiplier: 10.0,
      });
      const pos = { tokenId: 'yes-1', conditionId: 'c-1', side: 'yes' as const, entryPrice: 0.50, sizeUsdc: 20, orderId: 'o', openedAt: Date.now() };
      // Flat prices -> priceVel = 0 -> detectExhaustion returns null
      // @ts-expect-error - access private
      strat.priceHistory.set('yes-1', [0.50, 0.50, 0.50]);
      // @ts-expect-error - access private
      strat.volumeHistory.set('yes-1', [1000, 1000, 1000]);

      // @ts-expect-error - call protected method
      const res = strat.getCustomExitCondition(pos, 0.50);
      expect(res).toEqual({ exit: false, reason: '' });
    });
  });

  describe('scanEntries additional guards', () => {
    it('skips entry when mid price is out of bounds', async () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(() => 0));
      // @ts-expect-error - call protected method
      await strat.scanEntries([makeMarket({ volume: 5000 })]);
      // @ts-expect-error - access private
      expect(strat.positions.length).toBe(0);
    });

    it('falls back to yesTokenId when noTokenId is not present in market on "no" side', async () => {
      // Up-trend exhaustion -> signal 'no' (buys noTokenId, or falls back to yesTokenId if noTokenId missing)
      const strat = new MomentumExhaustionStrategy(makeDeps((_t, i) => 0.50 + 0.01 * i - Math.max(0, i - 5) * 0.009));
      const marketAt = (i: number) => makeMarket({ volume: 2000 + 100 * i, noTokenId: undefined });
      for (let i = 0; i < 8; i++) {
        // @ts-expect-error - call protected method
        await strat.scanEntries([marketAt(i)]);
      }
      // @ts-expect-error - access private
      expect(strat.positions.length).toBe(1);
      // @ts-expect-error - access private
      expect(strat.positions[0]!.tokenId).toBe('yes-1');
      // @ts-expect-error - access private
      expect(strat.positions[0]!.side).toBe('no');
    });

    it('breaks market loop when max positions is reached during iteration', async () => {
      const strat = new MomentumExhaustionStrategy(makeDeps(), { maxPositions: 1 });
      // Pre-fill 1 position
      // @ts-expect-error - access private
      strat.positions.push({ tokenId: 'yes-1', conditionId: 'c-1', side: 'yes', entryPrice: 0.5, sizeUsdc: 15, orderId: 'o', openedAt: Date.now() });
      const m1 = makeMarket({ conditionId: 'c-2', volume: 5000 });
      const m2 = makeMarket({ conditionId: 'c-3', volume: 5000 });
      // @ts-expect-error - call protected method
      await strat.scanEntries([m1, m2]);
      expect(strat.deps.clob.getOrderBook).not.toHaveBeenCalled();
    });
  });
});
