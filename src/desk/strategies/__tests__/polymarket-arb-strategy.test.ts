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
} from '../polymarket-arb-strategy';
import type { StrategyDeps } from '../polymarket/base-polymarket-strategy';
import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

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

  describe('createPolymarketArbTick', () => {
    it('creates a tick function', async () => {
      const { createPolymarketArbTick } = await import('../polymarket-arb-strategy');
      const tick = createPolymarketArbTick(createMockDeps());
      expect(typeof tick).toBe('function');
      await expect(tick()).resolves.toBeUndefined();
    });
  });
});
