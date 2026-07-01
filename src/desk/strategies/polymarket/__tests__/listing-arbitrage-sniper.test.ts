/**
 * Tests for Listing Arbitrage Sniper.
 * Validates entry/exit logic, spread detection, market age tracking, cooldowns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ListingArbitrageSniper,
  computeSpreadRatio,
  isSpreadWide,
  isSpreadConverged,
  DEFAULT_LISTING_ARB_CONFIG,
  type ListingArbConfig,
} from '../listing-arbitrage-sniper';
import type { StrategyDeps } from '../base-polymarket-strategy';
import type { GammaMarket } from '../../../polymarket/gamma-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockGammaMarket(overrides?: Partial<GammaMarket>): GammaMarket {
  return {
    id: '0xmarket1',
    question: 'Will BTC hit $100K in 2026?',
    conditionId: '0xcond1',
    slug: 'btc-100k-2026',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.48', '0.49'],
    volume: 500,
    volume24h: 500,
    liquidity: 2000,
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    closed: false,
    resolved: false,
    tokens: [
      { token_id: '0xyes1', outcome: 'Yes', price: 0.48 },
      { token_id: '0xno1', outcome: 'No', price: 0.49 },
    ],
    yesTokenId: '0xyes1',
    noTokenId: '0xno1',
    yesPrice: 0.48,
    ...overrides,
  };
}

function mockStrategyDeps(overrides?: Partial<StrategyDeps>): StrategyDeps {
  return {
    clob: {
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [{ price: '0.48', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
      }),
    },
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-test-1' }),
    },
    eventBus: { emit: vi.fn() },
    gamma: { getTrending: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as StrategyDeps;
}

function createSniper(
  deps?: StrategyDeps,
  config?: Partial<ListingArbConfig>,
  clock?: () => number,
): ListingArbitrageSniper {
  return new ListingArbitrageSniper(deps ?? mockStrategyDeps(), config, clock);
}

// ── Pure helper tests ────────────────────────────────────────────────────────

describe('computeSpreadRatio', () => {
  it('returns sum of yes + no prices', () => {
    expect(computeSpreadRatio(0.48, 0.49)).toBeCloseTo(0.97);
  });

  it('returns 1.0 for efficient markets', () => {
    expect(computeSpreadRatio(0.50, 0.50)).toBeCloseTo(1.0);
  });
});

describe('isSpreadWide', () => {
  it('returns true when yes+no < threshold', () => {
    expect(isSpreadWide(0.48, 0.49, 0.98)).toBe(true);
  });

  it('returns false when yes+no >= threshold', () => {
    expect(isSpreadWide(0.50, 0.49, 0.98)).toBe(false);
  });
});

describe('isSpreadConverged', () => {
  it('returns true when yes+no > threshold', () => {
    expect(isSpreadConverged(0.50, 0.50, 0.99)).toBe(true);
  });

  it('returns false when yes+no <= threshold', () => {
    expect(isSpreadConverged(0.48, 0.49, 0.99)).toBe(false);
  });
});

// ── Strategy tests ───────────────────────────────────────────────────────────

describe('ListingArbitrageSniper', () => {
  let deps: StrategyDeps;
  let clock: () => number;
  let now: number;

  beforeEach(() => {
    now = Date.now();
    clock = () => now;
    deps = mockStrategyDeps();
  });

  // ── Market age tracking ──────────────────────────────────────────────────

  describe('market age tracking', () => {
    it('records first-seen time on observe', async () => {
      const sniper = createSniper(deps, {}, clock);
      const market = mockGammaMarket({ conditionId: '0xnew' });

      // Access private method via prototype for testing — trigger via scanEntries
      vi.mocked(deps.gamma.getTrending).mockResolvedValue([market]);
      // Market won't trigger entry (no spread), but will be observed
      await sniper.execute();

      // Age should be near 0
      const age = (sniper as any).getMarketAgeMs('0xnew');
      expect(age).not.toBeNull();
      expect(age!).toBeGreaterThanOrEqual(0);
      expect(age!).toBeLessThan(1000);
    });

    it('pruneObserved removes entries older than maxAge', () => {
      const sniper = createSniper(deps, {}, clock);
      // Manually insert old observation
      (sniper as any).observedMarkets.set('0xold', now - 25 * 60 * 60 * 1000); // 25h ago
      (sniper as any).observedMarkets.set('0xnew', now - 60 * 1000); // 1min ago

      sniper.pruneObserved();
      expect((sniper as any).observedMarkets.has('0xold')).toBe(false);
      expect((sniper as any).observedMarkets.has('0xnew')).toBe(true);
    });
  });

  // ── Entry scanning ────────────────────────────────────────────────────────

  describe('scanEntries', () => {
    it('enters when spread is wide and market is fresh', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        yesPrice: 0.48,
        volume24h: 1000,
        liquidity: 2000,
      });

      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.49', size: '100' }] })  // yes book
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.50', size: '100' }] }); // no book
      // yes mid = 0.48, no mid = 0.49, spread ratio = 0.97 < 0.98 → WIDE

      const sniper = createSniper(deps, {}, clock);
      await sniper.scanEntries([market]);

      expect(deps.orderManager.placeOrder).toHaveBeenCalled();
      const call = vi.mocked(deps.orderManager.placeOrder).mock.calls[0][0];
      expect(call.side).toBe('buy');
      // Sniper should enter on the cheaper side (yes at 0.48 < no at 0.49)
    });

    it('skips when spread is tight (converged)', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        yesPrice: 0.50,
        volume24h: 1000,
        liquidity: 2000,
      });

      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.49', size: '100' }], asks: [{ price: '0.51', size: '100' }] });
      // yes mid ≈ 0.50, no mid ≈ 0.50, spread ratio ≈ 1.00

      const sniper = createSniper(deps, {}, clock);
      await sniper.scanEntries([market]);

      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips when volume exceeds entry threshold', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        volume24h: 10_000, // > maxVolumeEntry (5000)
        liquidity: 2000,
      });

      const sniper = createSniper(deps, {}, clock);
      await sniper.scanEntries([market]);

      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips when market age exceeds max', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        yesPrice: 0.48,
        volume24h: 1000,
        liquidity: 2000,
      });

      // Pre-set observed to 40 min ago
      const sniper = createSniper(deps, {}, clock);
      (sniper as any).observedMarkets.set('0xcond1', now - 40 * 60 * 1000);

      await sniper.scanEntries([market]);
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips when below min liquidity', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        yesPrice: 0.48,
        volume24h: 1000,
        liquidity: 200, // < minLiquidity (500)
      });

      const sniper = createSniper(deps, {}, clock);
      await sniper.scanEntries([market]);
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips when on global cooldown', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond1',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        yesPrice: 0.48,
        volume24h: 1000,
        liquidity: 2000,
      });

      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.49', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.50', size: '100' }] });

      const sniper = createSniper(deps, {}, clock);
      // Set lastEntryTime to now → global cooldown active
      (sniper as any).lastEntryTime = now;

      await sniper.scanEntries([market]);
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('skips closed or resolved markets', async () => {
      const closedMarket = mockGammaMarket({
        conditionId: '0xclosed',
        yesTokenId: '0xyes1',
        noTokenId: '0xno1',
        closed: true,
      });
      const resolvedMarket = mockGammaMarket({
        conditionId: '0xresolved',
        yesTokenId: '0xyes2',
        noTokenId: '0xno2',
        resolved: true,
      });

      const sniper = createSniper(deps, {}, clock);
      await sniper.scanEntries([closedMarket, resolvedMarket]);
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });

    it('honors maxPositions limit', async () => {
      const market = mockGammaMarket({
        conditionId: '0xcond2',
        yesTokenId: '0xyes2',
        noTokenId: '0xno2',
        yesPrice: 0.48,
        volume24h: 1000,
        liquidity: 2000,
      });

      deps.clob.getOrderBook = vi.fn()
        .mockResolvedValueOnce({ bids: [{ price: '0.47', size: '100' }], asks: [{ price: '0.49', size: '100' }] })
        .mockResolvedValueOnce({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.50', size: '100' }] });

      const sniper = createSniper(deps, { maxPositions: 0 }, clock); // no positions allowed
      await sniper.scanEntries([market]);
      expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ── Custom exit condition ─────────────────────────────────────────────────

  describe('getCustomExitCondition', () => {
    it('signals exit when bid-ask spread tightens below 1%', () => {
      const sniper = createSniper(deps, {}, clock);
      const pos = {
        tokenId: '0xyes1',
        conditionId: '0xcond1',
        side: 'yes' as const,
        entryPrice: 0.48,
        sizeUsdc: 50,
        orderId: 'order-1',
        openedAt: now - 60_000,
      };

      // Tight spread: (0.505 - 0.500) / 0.500 = 1% → just at threshold, not < 1%
      // Need spread < 1%: (0.504 - 0.500) / 0.500 = 0.8%
      const book = {
        bids: [{ price: '0.500', size: '100' }],
        asks: [{ price: '0.504', size: '100' }],
      };

      const result = sniper['getCustomExitCondition'](pos, 0.502, book);
      expect(result.exit).toBe(true);
      expect(result.reason).toBe('spread converged');
    });

    it('does not signal exit when bid-ask spread still wide (>1%)', () => {
      const sniper = createSniper(deps, {}, clock);
      const pos = {
        tokenId: '0xyes1',
        conditionId: '0xcond1',
        side: 'yes' as const,
        entryPrice: 0.48,
        sizeUsdc: 50,
        orderId: 'order-1',
        openedAt: now - 60_000,
      };

      const book = {
        bids: [{ price: '0.47', size: '100' }],
        asks: [{ price: '0.49', size: '100' }],
      };
      // (0.49 - 0.47) / 0.47 ≈ 4.3% — still wide

      const result = sniper['getCustomExitCondition'](pos, 0.48, book);
      expect(result.exit).toBe(false);
    });
  });

  // ── Default config ────────────────────────────────────────────────────────

  describe('DEFAULT_LISTING_ARB_CONFIG', () => {
    it('has expected thresholds', () => {
      expect(DEFAULT_LISTING_ARB_CONFIG.spreadEntryThreshold).toBe(0.98);
      expect(DEFAULT_LISTING_ARB_CONFIG.spreadConvergenceThreshold).toBe(0.99);
      expect(DEFAULT_LISTING_ARB_CONFIG.maxMarketAgeMs).toBe(30 * 60 * 1000);
      expect(DEFAULT_LISTING_ARB_CONFIG.maxVolumeEntry).toBe(5000);
      expect(DEFAULT_LISTING_ARB_CONFIG.minVolumeExit).toBe(25_000);
      expect(DEFAULT_LISTING_ARB_CONFIG.maxSnipeUsd).toBe(50);
      expect(DEFAULT_LISTING_ARB_CONFIG.maxPositions).toBe(3);
    });
  });

  // ── Legacy factory ────────────────────────────────────────────────────────

  describe('createListingArbitrageSniperTick', () => {
    it('returns a tick function that calls execute', async () => {
      const { createListingArbitrageSniperTick } = await import('../listing-arbitrage-sniper');
      const tick = createListingArbitrageSniperTick(deps);
      expect(typeof tick).toBe('function');

      // Tick should not throw
      await expect(tick()).resolves.toBeUndefined();
      // getTrending should have been called (from execute())
      expect(deps.gamma.getTrending).toHaveBeenCalled();
    });
  });
});
