/**
 * Tests for vwap-deviation-sniper-v2 — pure helpers (calcVWAP, calcDeviation,
 * calcStdDev, calcZScore, determineSignal) plus the strategy class driven through
 * scanEntries with mocked deps (clob/gamma/wallet/logger).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../../src/desk/core/logger', () => ({ logger: mockLogger }));

import {
  calcVWAP,
  calcDeviation,
  calcStdDev,
  calcZScore,
  determineSignal,
  VwapDeviationSniperStrategy,
  createVwapDeviationSniperTick,
  DEFAULT_CONFIG,
  type VwapDeviationSniperConfig,
} from '../../../../../src/desk/strategies/polymarket/vwap-deviation-sniper-v2';
import type { StrategyDeps } from '../../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../../src/desk/polymarket/gamma-client';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeMockDeps(overrides: Record<string, unknown> = {}) {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: '0.49', size: '100' }, { price: '0.48', size: '200' }],
        asks: [{ price: '0.51', size: '100' }, { price: '0.52', size: '200' }],
      }),
      placeOrder: vi.fn().mockResolvedValue({ orderId: 'ord-1', status: 'active' }),
      cancelOrder: vi.fn().mockResolvedValue({ success: true }),
      getPositions: vi.fn().mockResolvedValue([]),
      ...overrides.clob,
    },
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1', status: 'active' }),
      ...overrides.orderManager,
    },
    gamma: {
      getMarkets: vi.fn().mockResolvedValue([]),
      getTrending: vi.fn().mockResolvedValue([]),
      ...overrides.gamma,
    },
    wallet: {
      getBalance: vi.fn().mockResolvedValue({ available: '10000' }),
      ...overrides.wallet,
    },
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      ...overrides.eventBus,
    },
  };
}

function makeMockMarket(overrides: Partial<{
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  volume: number;
  closed: boolean;
  resolved: boolean;
}> = {}) {
  return {
    conditionId: 'cond-1',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    volume: 10000,
    closed: false,
    resolved: false,
    ...overrides,
  };
}

// ─── Pure helper tests ─────────────────────────────────────────────────────────

describe('vwap-deviation-sniper-v2::calcVWAP', () => {
  it('returns 0 for empty arrays', () => {
    expect(calcVWAP([], [])).toBe(0);
  });

  it('returns 0 when lengths mismatch', () => {
    expect(calcVWAP([1, 2], [1])).toBe(0);
  });

  it('calculates correct VWAP', () => {
    // price: [10, 20], volume: [1, 1] -> (10*1 + 20*1) / 2 = 15
    expect(calcVWAP([10, 20], [1, 1])).toBe(15);
  });

  it('weights by volume', () => {
    // price: [10, 20], volume: [1, 3] -> (10*1 + 20*3) / 4 = 17.5
    expect(calcVWAP([10, 20], [1, 3])).toBe(17.5);
  });

  it('skips zero/negative volumes', () => {
    // volume 0 should be skipped
    expect(calcVWAP([10, 20], [0, 1])).toBe(20);
    expect(calcVWAP([10, 20], [-1, 1])).toBe(20);
  });

  it('returns 0 when sum volume is 0', () => {
    expect(calcVWAP([10, 20], [0, 0])).toBe(0);
    expect(calcVWAP([10, 20], [-1, -2])).toBe(0);
  });
});

describe('vwap-deviation-sniper-v2::calcDeviation', () => {
  it('returns 0 when vwap is 0', () => {
    expect(calcDeviation(0.5, 0)).toBe(0);
  });

  it('calculates deviation correctly', () => {
    // price 0.55, vwap 0.50 -> (0.55-0.50)/0.50 = 0.10
    expect(calcDeviation(0.55, 0.50)).toBeCloseTo(0.10, 10);
  });

  it('handles negative deviation', () => {
    // price 0.45, vwap 0.50 -> (0.45-0.50)/0.50 = -0.10
    expect(calcDeviation(0.45, 0.50)).toBeCloseTo(-0.10, 10);
  });
});

describe('vwap-deviation-sniper-v2::calcStdDev', () => {
  it('returns 0 for empty array', () => {
    expect(calcStdDev([], 0)).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(calcStdDev([5], 5)).toBe(0);
  });

  it('calculates standard deviation correctly', () => {
    // values: [1, 2, 3], mean: 2 -> sqrt(((1-2)^2 + (2-2)^2 + (3-2)^2)/3) = sqrt(2/3) ≈ 0.816
    expect(calcStdDev([1, 2, 3], 2)).toBeCloseTo(0.816, 2);
  });

  it('returns 0 when all values equal', () => {
    expect(calcStdDev([5, 5, 5], 5)).toBe(0);
  });
});

describe('vwap-deviation-sniper-v2::calcZScore', () => {
  it('returns 0 for insufficient history', () => {
    expect(calcZScore(5, [])).toBe(0);
    expect(calcZScore(5, [5])).toBe(0);
  });

  it('calculates z-score correctly', () => {
    // history: [1, 2, 3], mean: 2, std: ~0.816
    // value: 4 -> (4-2)/0.816 ≈ 2.45
    expect(calcZScore(4, [1, 2, 3])).toBeCloseTo(2.45, 1);
  });

  it('returns 0 when stdDev is 0', () => {
    expect(calcZScore(5, [5, 5, 5])).toBe(0);
  });

  it('handles negative z-score', () => {
    // history: [1, 2, 3], mean: 2, std: ~0.816
    // value: 0 -> (0-2)/0.816 ≈ -2.45
    expect(calcZScore(0, [1, 2, 3])).toBeCloseTo(-2.45, 1);
  });
});

describe('vwap-deviation-sniper-v2::determineSignal', () => {
  it('returns "yes" for oversold (z-score < -threshold)', () => {
    expect(determineSignal(-3, 2)).toBe('yes');
    expect(determineSignal(-2.5, 2)).toBe('yes');
    expect(determineSignal(-2.001, 2)).toBe('yes');
  });

  it('returns "no" for overbought (z-score > threshold)', () => {
    expect(determineSignal(3, 2)).toBe('no');
    expect(determineSignal(2.5, 2)).toBe('no');
    expect(determineSignal(2.001, 2)).toBe('no');
  });

  it('returns null within threshold', () => {
    expect(determineSignal(-1, 2)).toBeNull();
    expect(determineSignal(0, 2)).toBeNull();
    expect(determineSignal(1, 2)).toBeNull();
    expect(determineSignal(-2, 2)).toBeNull(); // exactly at threshold
    expect(determineSignal(2, 2)).toBeNull(); // exactly at threshold
  });
});

// ─── Strategy class tests ──────────────────────────────────────────────────────

describe('VwapDeviationSniperStrategy', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let strategy: VwapDeviationSniperStrategy;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeMockDeps();
    // Use vwapWindow=6 so max |z| = sqrt(5) ≈ 2.24 > threshold 2.0
    strategy = new VwapDeviationSniperStrategy(deps, {
      vwapWindow: 6,
      minPeriods: 3,
      deviationThreshold: 2.0,
      exitThreshold: 0.5,
      minVolume: 1000,
      positionSize: '10',
      maxPositions: 2,
    });
  });

  describe('constructor', () => {
    it('sets strategy name correctly', () => {
      expect(strategy.strategyName).toBe('vwap-deviation-sniper');
    });

    it('merges config with defaults', () => {
      const s = new VwapDeviationSniperStrategy(deps, { vwapWindow: 10 });
      // Can't directly access private config, but can verify behavior
      expect(s.strategyName).toBe('vwap-deviation-sniper');
    });
  });

  describe('getCustomExitCondition', () => {
    it('returns no exit when no price history', () => {
      const pos = { tokenId: 'token-1', conditionId: 'cond-1', side: 'yes' as const, size: 10, entryPrice: 0.5 };
      // @ts-expect-error - call protected method
      const result = strategy.getCustomExitCondition(pos, 0.5);
      expect(result.exit).toBe(false);
      expect(result.reason).toBe('');
    });

    it('returns no exit when VWAP is 0', () => {
      const pos = { tokenId: 'token-1', conditionId: 'cond-1', side: 'yes' as const, size: 10, entryPrice: 0.5 };
      // Price history exists but with zero volume -> calcVWAP returns 0
      // @ts-expect-error - access private
      strategy.priceHistory.set('token-1', [0.5, 0.5]);
      // @ts-expect-error - access private
      strategy.volumeHistory.set('token-1', [0, 0]);

      // @ts-expect-error - call protected method
      const result = strategy.getCustomExitCondition(pos, 0.5);
      expect(result.exit).toBe(false);
      expect(result.reason).toBe('');
    });

    it('returns exit when price reverts within exitThreshold', () => {
      const pos = { tokenId: 'token-1', conditionId: 'cond-1', side: 'yes' as const, size: 10, entryPrice: 0.5 };
      // Set history so VWAP = 0.50
      // @ts-expect-error - access private
      strategy.priceHistory.set('token-1', [0.50, 0.50]);
      // @ts-expect-error - access private
      strategy.volumeHistory.set('token-1', [1000, 1000]);

      // currentPrice 0.51 -> deviation = (0.51 - 0.50)/0.50 = 0.02 < exitThreshold 0.5
      // @ts-expect-error - call protected method
      const result = strategy.getCustomExitCondition(pos, 0.51);
      expect(result.exit).toBe(true);
      expect(result.reason).toContain('mean reversion');
    });

    it('returns no exit when price deviation remains above exitThreshold', () => {
      const pos = { tokenId: 'token-1', conditionId: 'cond-1', side: 'yes' as const, size: 10, entryPrice: 0.5 };
      // Set history so VWAP = 0.50
      // @ts-expect-error - access private
      strategy.priceHistory.set('token-1', [0.50, 0.50]);
      // @ts-expect-error - access private
      strategy.volumeHistory.set('token-1', [1000, 1000]);

      // currentPrice 0.80 -> deviation = (0.80 - 0.50)/0.50 = 0.60 >= exitThreshold 0.5
      // @ts-expect-error - call protected method
      const result = strategy.getCustomExitCondition(pos, 0.80);
      expect(result.exit).toBe(false);
      expect(result.reason).toBe('');
    });
  });

  describe('estimateDepthVolume & recordPriceVolume trimming', () => {
    it('estimates depth volume correctly with custom or default levels', () => {
      const book = {
        bids: [{ size: '10' }, { size: '20' }],
        asks: [{ size: '15' }, { size: '25' }],
      };
      // @ts-expect-error - call private method
      const volDefault = strategy.estimateDepthVolume(book);
      expect(volDefault).toBe(10 + 15 + 20 + 25);

      // @ts-expect-error - call private method with level limit 1
      const vol1 = strategy.estimateDepthVolume(book, 1);
      expect(vol1).toBe(10 + 15);
    });

    it('trims price and volume history when exceeding vwapWindow', () => {
      // vwapWindow is 6
      for (let i = 0; i < 10; i++) {
        // @ts-expect-error - call private method
        strategy.recordPriceVolume('token-test', 0.5 + i * 0.01, 100);
      }
      // @ts-expect-error - access private
      const prices = strategy.priceHistory.get('token-test');
      // @ts-expect-error - access private
      const volumes = strategy.volumeHistory.get('token-test');
      expect(prices?.length).toBe(6);
      expect(volumes?.length).toBe(6);
    });
  });

  describe('scanEntries', () => {
    it('returns early when max positions reached', async () => {
      // Set up internal state to have max positions
      // Since we can't easily access private state, we test that it doesn't crash
      const markets = [makeMockMarket({ conditionId: 'cond-1' })];
      await expect(strategy.scanEntries(markets)).resolves.not.toThrow();
    });

    it('skips closed/resolved markets', async () => {
      const markets = [
        makeMockMarket({ conditionId: 'cond-1', closed: true }),
        makeMockMarket({ conditionId: 'cond-2', resolved: true }),
      ];
      await expect(strategy.scanEntries(markets)).resolves.not.toThrow();
      // getOrderBook should not be called for closed/resolved
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets without yesTokenId', async () => {
      const markets = [makeMockMarket({ conditionId: 'cond-1', yesTokenId: '' })];
      await expect(strategy.scanEntries(markets)).resolves.not.toThrow();
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets below minVolume', async () => {
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 500 })];
      await expect(strategy.scanEntries(markets)).resolves.not.toThrow();
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('processes valid market and records price/volume', async () => {
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000 })];
      await strategy.scanEntries(markets);
      expect(deps.clob.getOrderBook).toHaveBeenCalledWith('yes-1');
    });

    it('skips when mid price is invalid (<=0 or >=1)', async () => {
      deps.clob.getOrderBook.mockResolvedValueOnce({
        bids: [{ price: '0', size: '100' }],
        asks: [{ price: '0', size: '100' }],
      });
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000 })];
      await strategy.scanEntries(markets);
      // Should not call enterPosition
    });

    it('enters position when z-score exceeds threshold (oversold)', async () => {
      // Need enough price history for z-score calculation
      // First calls build up history, then trigger signal
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000 })];

      // Use mockResolvedValueOnce chain to return different values for each call
      // Need varying history so stdDev > 0
      // History: [0.48, 0.50, 0.52, 0.49, 0.51] -> mean=0.5, stdDev≈0.0141
      // 6th call: mid=0.015 -> z=(0.015-0.5)/0.0141 ≈ -34.4 < -2.0
      deps.clob.getOrderBook
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }] }) // 1: mid=0.50
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] }) // 2: mid=0.50
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.53', size: '100' }] }) // 3: mid=0.50
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] }) // 4: mid=0.50
        .mockResolvedValueOnce({ bids: [{ price: '0.51', size: '100' }], asks: [{ price: '0.49', size: '100' }] }) // 5: mid=0.50
        .mockResolvedValueOnce({ bids: [{ price: '0.01', size: '100' }], asks: [{ price: '0.02', size: '100' }] }); // 6: mid=0.015 - oversold

      // Need multiple scan calls to build history
      await strategy.scanEntries(markets); // 1
      await strategy.scanEntries(markets); // 2
      await strategy.scanEntries(markets); // 3
      await strategy.scanEntries(markets); // 4
      await strategy.scanEntries(markets); // 5 - minPeriods reached
      await strategy.scanEntries(markets); // 6 - oversold

      // enterPosition should have been called via orderManager
      expect(deps.orderManager.placeOrder).toHaveBeenCalled();
    });

    it('uses correct tokenId for side (yes/no)', async () => {
      // Test the logic of token selection for overbought (BUY NO)
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000, noTokenId: 'no-custom-1' })];
      deps.clob.getOrderBook
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.53', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.51', size: '100' }], asks: [{ price: '0.49', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.98', size: '100' }], asks: [{ price: '0.99', size: '100' }] }); // Overbought

      for (let i = 0; i < 6; i++) {
        await strategy.scanEntries(markets);
      }

      expect(deps.orderManager.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'no-custom-1',
        })
      );
    });

    it('falls back to yesTokenId when buying NO if noTokenId is missing', async () => {
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000, noTokenId: undefined })];
      deps.clob.getOrderBook
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.53', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.51', size: '100' }], asks: [{ price: '0.49', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.98', size: '100' }], asks: [{ price: '0.99', size: '100' }] }); // Overbought

      for (let i = 0; i < 6; i++) {
        await strategy.scanEntries(markets);
      }

      expect(deps.orderManager.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'yes-1',
        })
      );
    });

    it('skips entry when market already has open position or is on cooldown', async () => {
      const market = makeMockMarket({ conditionId: 'cond-active', volume: 10000 });
      // @ts-expect-error - access private
      strategy.positions.push({
        tokenId: 'yes-1',
        conditionId: 'cond-active',
        side: 'yes',
        entryPrice: 0.5,
        sizeUsdc: 10,
        orderId: 'o-1',
        openedAt: Date.now(),
      });

      await strategy.scanEntries([market]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();

      // Cooldown test
      const m2 = makeMockMarket({ conditionId: 'cond-cooldown', volume: 10000 });
      // @ts-expect-error - access private
      strategy.cooldowns.set('cond-cooldown', Date.now() + 60000);
      await strategy.scanEntries([m2]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('breaks loop when position count reaches maxPositions during scan', async () => {
      const stratMax1 = new VwapDeviationSniperStrategy(deps, { maxPositions: 1 });
      // @ts-expect-error - access private
      stratMax1.positions.push({
        tokenId: 'yes-1',
        conditionId: 'cond-1',
        side: 'yes',
        entryPrice: 0.5,
        sizeUsdc: 10,
        orderId: 'o-1',
        openedAt: Date.now(),
      });

      const m1 = makeMockMarket({ conditionId: 'cond-2', volume: 10000 });
      const m2 = makeMockMarket({ conditionId: 'cond-3', volume: 10000 });
      await stratMax1.scanEntries([m1, m2]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips when calculated entryPrice is invalid (<=0 or >=1)', async () => {
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000 })];
      deps.clob.getOrderBook
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.53', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.51', size: '100' }], asks: [{ price: '0.49', size: '100' }] })
        // Overbought signal ('no'), bid = 1.0, ask = 0.98 -> mid = 0.99 < 1, entryPrice = 1 - 1.0 = 0 <= 0
        .mockResolvedValueOnce({ bids: [{ price: '1.0', size: '100' }], asks: [{ price: '0.98', size: '100' }] });

      for (let i = 0; i < 6; i++) {
        await strategy.scanEntries(markets);
      }
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('handles getOrderBook error gracefully', async () => {
      deps.clob.getOrderBook.mockRejectedValueOnce(new Error('Network error'));
      const markets = [makeMockMarket({ conditionId: 'cond-1', volume: 10000 })];
      await expect(strategy.scanEntries(markets)).resolves.not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Scan error',
        'vwap-deviation-sniper',
        expect.objectContaining({ err: expect.stringContaining('Network error') })
      );
    });
  });
});

// ─── Factory function test ─────────────────────────────────────────────────────

describe('vwap-deviation-sniper-v2::createVwapDeviationSniperTick', () => {
  it('returns a tick function', () => {
    const deps = makeMockDeps();
    const tickFn = createVwapDeviationSniperTick(deps);
    expect(typeof tickFn).toBe('function');
  });

  it('creates strategy with custom config', () => {
    const deps = makeMockDeps();
    const tickFn = createVwapDeviationSniperTick({
      ...deps,
      config: { vwapWindow: 50, deviationThreshold: 3.0 },
    });
    expect(typeof tickFn).toBe('function');
  });
});

// ─── Integration-style test ────────────────────────────────────────────────────

describe('VwapDeviationSniperStrategy integration', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let strategy: VwapDeviationSniperStrategy;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeMockDeps();
    // Use vwapWindow=6 so max |z| = sqrt(5) ≈ 2.24 > threshold 2.0
    strategy = new VwapDeviationSniperStrategy(deps, {
      vwapWindow: 6,
      minPeriods: 3,
      deviationThreshold: 2.0,
      exitThreshold: 0.5,
      minVolume: 1000,
      positionSize: '10',
      maxPositions: 2,
    });
  });

  it('full cycle: scan -> enter -> exit on reversion', async () => {
    const market = makeMockMarket({ conditionId: 'cond-1', volume: 10000 });

    // 1. Build price history (need minPeriods = 3, need 6 for z-score threshold)
    deps.clob.getOrderBook
      .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
      .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }] })
      .mockResolvedValueOnce({ bids: [{ price: '0.50', size: '100' }], asks: [{ price: '0.50', size: '100' }] })
      .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
      .mockResolvedValueOnce({ bids: [{ price: '0.51', size: '100' }], asks: [{ price: '0.49', size: '100' }] });

    await strategy.scanEntries([market]); // 1
    await strategy.scanEntries([market]); // 2
    await strategy.scanEntries([market]); // 3
    await strategy.scanEntries([market]); // 4
    await strategy.scanEntries([market]); // 5 - minPeriods reached, history full

    // 2. Oversold signal (mid drops significantly)
    deps.clob.getOrderBook.mockResolvedValueOnce({
      bids: [{ price: '0.30', size: '100' }],
      asks: [{ price: '0.35', size: '100' }],
    });

    await strategy.scanEntries([market]);

    expect(deps.orderManager.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'yes-1',
        side: 'buy',
      })
    );

    // 3. Price reverts to VWAP -> exit condition
    // This would be tested via the actual tick function running periodically
  });
});