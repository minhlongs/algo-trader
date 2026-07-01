/**
 * Characterization tests for BasePolymarketStrategy.
 * Validates position management, TP/SL exits, cooldowns, and tick lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
  type OpenPosition,
} from '../base-polymarket-strategy';
import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { StrategyName } from '../../../core/types';

// Concrete subclass for testing
class TestStrategy extends BasePolymarketStrategy {
  public scannedMarkets: GammaMarket[][] = [];

  constructor(deps: StrategyDeps, config: BaseStrategyConfig) {
    super(deps, config, 'test-strategy' as StrategyName);
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    this.scannedMarkets.push([...markets]);
  }

  // Expose protected methods for testing
  public testHasPosition(conditionId: string): boolean {
    return this.hasPosition(conditionId);
  }
  public testIsOnCooldown(conditionId: string): boolean {
    return this.isOnCooldown(conditionId);
  }
  public getPositions(): OpenPosition[] {
    return [...this.positions];
  }
  public testBestBidAsk() {
    return this.bestBidAsk({ bids: [{ price: '0.50', size: '100' }], asks: [{ price: '0.52', size: '100' }] });
  }
  public async testCheckExits(): Promise<void> {
    await this.checkExits();
  }
  public async testEnter(tokenId: string, conditionId: string, side: 'yes' | 'no', price: number, size: number): Promise<void> {
    await this.enterPosition(tokenId, conditionId, side, price, size);
  }
}

const defaultConfig: BaseStrategyConfig = {
  minVolume: 5000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 60_000,
  positionSize: '10',
};

function createMockDeps(overrides?: Partial<StrategyDeps>): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      }),
    },
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-test-1' }),
    },
    eventBus: {
      emit: vi.fn(),
    },
    gamma: {
      getTrending: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

describe('BasePolymarketStrategy', () => {
  let deps: StrategyDeps;
  let strategy: TestStrategy;

  beforeEach(() => {
    deps = createMockDeps();
    strategy = new TestStrategy(deps, defaultConfig);
  });

  // ── Position management ─────────────────────────────────────────────────

  describe('position management', () => {
    it('has no positions initially', () => {
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('hasPosition returns false for unknown conditionId', () => {
      expect(strategy.testHasPosition('unknown')).toBe(false);
    });

    it('can enter a position', async () => {
      await strategy.testEnter('token-1', 'cond-1', 'yes', 0.50, 10);
      expect(strategy.getPositionCount()).toBe(1);
      expect(strategy.testHasPosition('cond-1')).toBe(true);
    });

    it('entered position has correct fields', async () => {
      await strategy.testEnter('token-1', 'cond-1', 'yes', 0.55, 20);
      const pos = strategy.getPositions()[0];
      expect(pos.tokenId).toBe('token-1');
      expect(pos.conditionId).toBe('cond-1');
      expect(pos.side).toBe('yes');
      expect(pos.entryPrice).toBeCloseTo(0.55);
      expect(pos.sizeUsdc).toBe(20);
      expect(pos.orderId).toBe('order-test-1');
      expect(pos.openedAt).toBeGreaterThan(0);
    });

    it('emits trade event on entry', async () => {
      await strategy.testEnter('token-1', 'cond-1', 'no', 0.45, 15);
      expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
        trade: expect.objectContaining({
          marketId: 'cond-1',
          side: 'buy',
          strategy: 'test-strategy',
        }),
      }));
    });
  });

  // ── Exit logic ──────────────────────────────────────────────────────────

  describe('exit logic', () => {
    it('exits on take profit (yes side)', async () => {
      await strategy.testEnter('token-yes', 'cond-tp', 'yes', 0.50, 10);

      // Current price = 0.52 → gain = (0.52 - 0.50) / 0.50 = 0.04 = 4% > 2% TP
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.52', size: '100' }],
        asks: [{ price: '0.53', size: '100' }],
      });

      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(0); // position closed
    });

    it('exits on stop loss (yes side)', async () => {
      await strategy.testEnter('token-yes', 'cond-sl', 'yes', 0.50, 10);

      // Current mid = (0.48 + 0.49)/2 = 0.485 → gain = (0.485 - 0.50)/0.50 = -3% < -1.5% SL
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.48', size: '100' }],
        asks: [{ price: '0.49', size: '100' }],
      });

      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('exits on stop loss (no side)', async () => {
      await strategy.testEnter('token-no', 'cond-sl-no', 'no', 0.50, 10);

      // For NO side: gain = (entry - current) / entry = (0.50 - 0.51) / 0.50 = -0.02 = -2% < -1.5% SL
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.51', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      });

      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('exits on max hold time', async () => {
      const now = Date.now();
      // Set openedAt far in the past
      await strategy.testEnter('token-old', 'cond-old', 'yes', 0.50, 10);
      (strategy.getPositions()[0] as any).openedAt = now - 20 * 60_000; // 20 min ago (maxHold = 10 min)

      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(0);
    });

    it('sets cooldown after exit', async () => {
      await strategy.testEnter('token-ex', 'cond-cooldown', 'yes', 0.50, 10);
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.60', size: '100' }], // forces TP
        asks: [{ price: '0.61', size: '100' }],
      });

      await strategy.testCheckExits();
      expect(strategy.testIsOnCooldown('cond-cooldown')).toBe(true);
    });

    it('does not exit when within TP/SL/maxHold bounds', async () => {
      await strategy.testEnter('token-hold', 'cond-hold', 'yes', 0.50, 10);

      // Current price = 0.505 → gain = 1%, within TP (2%) and SL (1.5%)
      deps.clob.getOrderBook = vi.fn().mockResolvedValue({
        bids: [{ price: '0.505', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
      });

      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(1);
    });
  });

  // ── Error resilience ────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('handles getOrderBook failure gracefully during exit', async () => {
      await strategy.testEnter('token-err', 'cond-err', 'yes', 0.50, 10);
      deps.clob.getOrderBook = vi.fn().mockRejectedValue(new Error('RPC timeout'));

      // Should not throw
      await strategy.testCheckExits();
      expect(strategy.getPositionCount()).toBe(1); // position stays open
    });

    it('execute() catches errors and does not throw', async () => {
      deps.gamma.getTrending = vi.fn().mockRejectedValue(new Error('API down'));
      await expect(strategy.execute()).resolves.toBeUndefined();
    });
  });

  // ── Tick lifecycle ──────────────────────────────────────────────────────

  describe('tick lifecycle', () => {
    it('calls scanEntries with trending markets', async () => {
      const markets = [{ id: 'm1', conditionId: 'c1', question: 'Test', volume: 10000 }] as GammaMarket[];
      deps.gamma.getTrending = vi.fn().mockResolvedValue(markets);

      await strategy.execute();
      expect(strategy.scannedMarkets).toHaveLength(1);
      expect(strategy.scannedMarkets[0]).toEqual(markets);
    });

    it('toTickFn returns a callable function', async () => {
      const tick = strategy.toTickFn();
      expect(typeof tick).toBe('function');
      await expect(tick()).resolves.toBeUndefined();
    });
  });

  // ── Price helpers ───────────────────────────────────────────────────────

  describe('bestBidAsk', () => {
    it('returns correct bid/ask/mid from order book', () => {
      const ba = strategy.testBestBidAsk();
      expect(ba.bid).toBe(0.50);
      expect(ba.ask).toBe(0.52);
      expect(ba.mid).toBe(0.51);
    });
  });

  // ── Custom exit condition ───────────────────────────────────────────────

  describe('custom exit condition', () => {
    it('can exit based on custom condition', async () => {
      // Override custom exit
      const customStrategy = new (class extends TestStrategy {
        protected getCustomExitCondition() {
          return { exit: true, reason: 'custom-exit' };
        }
      })(deps, defaultConfig);

      await customStrategy.testEnter('token-c', 'cond-c', 'yes', 0.50, 10);

      await customStrategy.testCheckExits();
      expect(customStrategy.getPositionCount()).toBe(0);
    });
  });
});
