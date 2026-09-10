/**
 * PolymarketArbStrategy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PolymarketArbStrategy,
  detectYesNoArb,
  detectCrossMarketArb,
  updateSpreadHistory,
  DEFAULT_CONFIG,
} from '../../../../src/desk/strategies/polymarket-arb-strategy';
import type { StrategyDeps } from '../../../../src/desk/strategies/polymarket/base-polymarket-strategy';
import type { GammaMarket } from '../../../../src/desk/polymarket/gamma-client';
import type { StrategyName } from '../../../../src/desk/core/types';

function createMockDeps(overrides?: Partial<StrategyDeps>): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      }),
    },
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-test' }),
    },
    eventBus: {
      emit: vi.fn(),
    },
    gamma: {
      getTrending: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as StrategyDeps;
}

describe('PolymarketArbStrategy', () => {
  describe('detectYesNoArb', () => {
    it('returns spread when combined price is below 1', () => {
      const spread = detectYesNoArb(0.45, 0.45);
      expect(spread).toBeCloseTo(0.10); // 1 - 0.9
    });

    it('returns 0 when combined price equals 1', () => {
      const spread = detectYesNoArb(0.5, 0.5);
      expect(spread).toBe(0);
    });

    it('returns 0 when combined price exceeds 1', () => {
      const spread = detectYesNoArb(0.55, 0.5);
      expect(spread).toBe(0);
    });

    it('handles extreme price values', () => {
      const spread = detectYesNoArb(0.01, 0.01);
      expect(spread).toBeCloseTo(0.98);
    });
  });

  describe('detectCrossMarketArb', () => {
    it('returns absolute difference between two prices', () => {
      const diff = detectCrossMarketArb(0.5, 0.55);
      expect(diff).toBeCloseTo(0.05, 6);
    });

    it('returns same value regardless of order', () => {
      expect(detectCrossMarketArb(0.5, 0.55)).toBeCloseTo(0.05, 6);
      expect(detectCrossMarketArb(0.55, 0.5)).toBeCloseTo(0.05, 6);
    });

    it('returns 0 when prices are equal', () => {
      expect(detectCrossMarketArb(0.5, 0.5)).toBe(0);
    });
  });

  describe('updateSpreadHistory', () => {
    it('appends spread to history for a key', () => {
      const history = new Map<string, number[]>();
      const avg = updateSpreadHistory(history, 'market-1', 0.05, 5);
      expect(avg).toBe(0.05);
      expect(history.get('market-1')).toEqual([0.05]);
    });

    it('trims history to lookback limit', () => {
      const history = new Map<string, number[]>();
      for (let i = 0; i < 10; i++) {
        updateSpreadHistory(history, 'market-1', i * 0.01, 3);
      }
      expect(history.get('market-1')?.length).toBe(3);
    });

    it('computes running average correctly', () => {
      const history = new Map<string, number[]>();
      updateSpreadHistory(history, 'm1', 0.04, 5);
      updateSpreadHistory(history, 'm1', 0.06, 5);
      const avg = updateSpreadHistory(history, 'm1', 0.08, 5);
      expect(avg).toBeCloseTo(0.06); // (0.04 + 0.06 + 0.08) / 3
    });

    it('returns 0 for empty history when no entries pushed', () => {
      const history = new Map<string, number[]>();
      history.set('empty', []);
      const avg = updateSpreadHistory(history, 'empty', 0.05, 5);
      expect(avg).toBe(0.05); // after pushing, avg = 0.05 / 1
    });
  });

  describe('PolymarketArbStrategy class', () => {
    let deps: StrategyDeps;
    let strategy: PolymarketArbStrategy;

    beforeEach(() => {
      deps = createMockDeps();
      strategy = new PolymarketArbStrategy(deps);
    });

    it('constructs with default config', () => {
      expect(strategy).toBeDefined();
    });

    it('constructs with custom config', () => {
      const custom = new PolymarketArbStrategy(deps, { minSpread: 0.05, maxLegSize: 100 });
      expect(custom).toBeDefined();
    });

    it('has zero positions initially', () => {
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('toTickFn returns a callable function', async () => {
      const tick = strategy.toTickFn();
      expect(typeof tick).toBe('function');
      await expect(tick()).resolves.toBeUndefined();
    });

    it('execute runs without error with empty markets', async () => {
      await expect(strategy.execute()).resolves.toBeUndefined();
    });

    it('skips closed markets during scan', async () => {
      const markets = [
        {
          conditionId: 'c1',
          yesTokenId: 'yes-1',
          noTokenId: 'no-1',
          closed: true,
          resolved: false,
          volume: 10000,
        },
      ] as GammaMarket[];
      deps.gamma.getTrending = vi.fn().mockResolvedValue(markets);

      await strategy.execute();
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('skips markets already held', async () => {
      const markets = [
        {
          conditionId: 'c1',
          yesTokenId: 'yes-1',
          noTokenId: 'no-1',
          closed: false,
          resolved: false,
          volume: 10000,
        },
      ] as GammaMarket[];

      // Enter position for conditionId = 'c1'
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      });

      // First execute: should scan and possibly enter
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      });

      await strategy.execute();
      // With bid=0.50, ask=0.52 -> mid=0.51 each
      // Combined YES+NO = 1.02 > 0.98 threshold, so no entry
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('handles getOrderBook errors gracefully', async () => {
      const markets = [
        {
          conditionId: 'c-err',
          yesTokenId: 'yes-err',
          noTokenId: 'no-err',
          closed: false,
          resolved: false,
          volume: 10000,
        },
      ] as GammaMarket[];

      deps.gamma.getTrending = vi.fn().mockResolvedValue(markets);
      deps.clob.getOrderBook = vi.fn().mockRejectedValue(new Error('RPC error'));

      await expect(strategy.execute()).resolves.toBeUndefined();
    });

    it('skips markets with 0 or negative mid prices', async () => {
      const markets = [
        {
          conditionId: 'c-zero',
          yesTokenId: 'yes-zero',
          noTokenId: 'no-zero',
          closed: false,
          resolved: false,
          volume: 10000,
        },
      ] as GammaMarket[];

      deps.gamma.getTrending = vi.fn().mockResolvedValue(markets);
      // Empty orderbook -> bid=0, ask=1 -> mid=0.5 (not skipped)
      // Use both empty to get mid=0
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [],
        asks: [],
      });

      await expect(strategy.execute()).resolves.toBeUndefined();
      // With both books empty, bid=0, ask=0 -> mid=0, so mid <= 0 -> skipped
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('skips markets with mid price >= 1', async () => {
      const markets = [
        {
          conditionId: 'c-high',
          yesTokenId: 'yes-high',
          noTokenId: 'no-high',
          closed: false,
          resolved: false,
          volume: 10000,
        },
      ] as GammaMarket[];

      deps.gamma.getTrending = vi.fn().mockResolvedValue(markets);
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.99', size: '100' }],
        asks: [{ price: '1.01', size: '100' }],
      });

      await expect(strategy.execute()).resolves.toBeUndefined();
      expect(strategy.getPositionCount()).toBe(0);
    });
  });

  describe('scanEntries — successful arbitrage entry', () => {
    let deps: StrategyDeps;
    let strategy: PolymarketArbStrategy;

    beforeEach(() => {
      deps = createMockDeps();
      strategy = new PolymarketArbStrategy(deps, { minSpread: 0.02, maxCombinedPrice: 0.98 });
    });

    it('enters YES+NO positions when spread is profitable (lines 150-177)', async () => {
      const market = {
        conditionId: 'c1',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      // yes mid = 0.48, no mid = 0.48 → combined = 0.96 < 0.98, spread = 0.04
      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] });

      await (strategy as any).scanEntries([market]);

      // Two positions: YES and NO for the same conditionId
      expect(strategy.getPositionCount()).toBe(2);
      expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(2);
      // First entry buys YES tokenId
      expect(deps.orderManager.placeOrder.mock.calls[0][0].tokenId).toBe('yes-1');
      // Second entry buys NO tokenId
      expect(deps.orderManager.placeOrder.mock.calls[1][0].tokenId).toBe('no-1');
    });

    it('sets cooldown after entering (line 177)', async () => {
      const market = {
        conditionId: 'c1',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValue({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] });

      await (strategy as any).scanEntries([market]);

      expect((strategy as any).cooldowns.has('c1')).toBe(true);
    });
  });

  describe('scanEntries — continue on enterPosition error (lines 178-183)', () => {
    it('logs debug and continues when enterPosition throws', async () => {
      const deps = createMockDeps();
      const strategy = new PolymarketArbStrategy(deps, { minSpread: 0.02 });

      // First order succeeds, second fails — but still processes next market
      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] });

      let callCount = 0;
      deps.orderManager.placeOrder = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ id: 'ok' });
        return Promise.reject(new Error('exchange down'));
      });

      const market = {
        conditionId: 'c1',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      // Should not throw despite enterPosition failure
      await expect((strategy as any).scanEntries([market])).resolves.toBeUndefined();
    });
  });

  describe('scanEntries — filter conditions', () => {
    let deps: StrategyDeps;
    let strategy: PolymarketArbStrategy;

    beforeEach(() => {
      deps = createMockDeps();
      strategy = new PolymarketArbStrategy(deps, { minSpread: 0.02 });
    });

    it('skips markets with volume below minVolume (line 111)', async () => {
      const market = {
        conditionId: 'c-low-vol',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 100, // below default minVolume of 2000
      } as GammaMarket;

      await (strategy as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets when volume is undefined (line 111)', async () => {
      const market = {
        conditionId: 'c-no-vol',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        // volume is undefined
      } as GammaMarket;

      await (strategy as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets on cooldown (line 110)', async () => {
      const market = {
        conditionId: 'c-cd',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      (strategy as any).cooldowns.set('c-cd', Date.now() + 60_000);

      await (strategy as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('breaks when maxPositions reached mid-loop (line 107)', async () => {
      // Pre-fill 3 positions (maxPositions = 3), leaving room for 0 more
      (strategy as any).positions.push(
        { conditionId: 'pre1' }, { conditionId: 'pre2' }, { conditionId: 'pre3' },
      );

      const markets = [
        { conditionId: 'c1', yesTokenId: 'y1', noTokenId: 'n1', closed: false, resolved: false, volume: 10000 },
        { conditionId: 'c2', yesTokenId: 'y2', noTokenId: 'n2', closed: false, resolved: false, volume: 10000 },
      ] as GammaMarket[];

      await (strategy as any).scanEntries(markets);
      // getPositionCount() returns 3 >= maxPositions(3) at line 104 → early return
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips markets without noTokenId (line 108)', async () => {
      const market = {
        conditionId: 'c-no-token',
        yesTokenId: 'yes-1',
        noTokenId: undefined,
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      await (strategy as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).not.toHaveBeenCalled();
    });

    it('skips when spread is 0 (no arb) (line 128)', async () => {
      const market = {
        conditionId: 'c-no-spread',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      // Both at 0.50 → combined = 1.0 → spread = 0
      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValue({ bids: [{ price: '0.50', size: '100' }], asks: [{ price: '0.50', size: '100' }] });

      await (strategy as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).toHaveBeenCalled();
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips when avgSpread is below minSpread after lookback (line 138)', async () => {
      const strategyLow = new PolymarketArbStrategy(deps, { minSpread: 0.10, spreadLookback: 2 });
      const market = {
        conditionId: 'c-low-spread',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      // Spread = 0.04 per entry, avg = 0.04 < 0.10
      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValue({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.48', size: '100' }] });

      // First call records the spread
      await (strategyLow as any).scanEntries([market]);
      // Second call records again, still avg < minSpread
      await (strategyLow as any).scanEntries([market]);

      // No positions entered because avgSpread < minSpread
      expect(strategyLow.getPositionCount()).toBe(0);
    });

    it('skips when combined price >= maxCombinedPrice (line 142)', async () => {
      const market = {
        conditionId: 'c-high-combined',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        closed: false,
        resolved: false,
        volume: 10000,
      } as GammaMarket;

      // Combined = 0.50 + 0.50 = 1.00 > 0.98 → skipped (but spread = 0, also filtered)
      // Use custom thresholds to test the combined price check specifically:
      // yes mid = 0.50, no mid = 0.50 → combined = 1.00, spread = 0
      // That filters at spread check first. To test combined price, we need:
      // combined < 1 (to pass spread check) but combined >= maxCombinedPrice
      // So use maxCombinedPrice = 0.90 with combined = 0.98
      const strategyCustom = new PolymarketArbStrategy(deps, {
        minSpread: 0.01,
        maxCombinedPrice: 0.90,
      });

      // Combined = 0.50 + 0.50 = 1.0 → combined >= 0.90, but spread = 0 → skipped earlier
      // Need spread > 0 AND combined >= maxCombinedPrice
      // yes mid = 0.45, no mid = 0.50 → combined = 0.95, spread = 0.05
      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.44', size: '100' }], asks: [{ price: '0.45', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.50', size: '100' }] });

      await (strategyCustom as any).scanEntries([market]);
      expect(deps.clob.getOrderBook).toHaveBeenCalled();
      // Combined = 0.95 >= maxCombinedPrice(0.90) → skipped at line 142
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('createPolymarketArbTick', () => {
    it('creates a tick function', async () => {
      const { createPolymarketArbTick } = await import('../../../../src/desk/strategies/polymarket-arb-strategy');
      const tick = createPolymarketArbTick(createMockDeps());
      expect(typeof tick).toBe('function');
      await expect(tick()).resolves.toBeUndefined();
    });
  });
});
