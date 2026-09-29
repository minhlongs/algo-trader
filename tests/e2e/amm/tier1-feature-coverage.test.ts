/**
 * Tier 1: Feature Coverage Test Suite (Prediction Market AMM & Negative-Risk Arbitrage Engine)
 *
 * Covers all 15 features (F1 through F15) in isolation with >= 5 test cases per feature (75 total tests).
 * Validates baseline contracts, mathematical invariants, state machines, and execution paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LmsrPricing,
  DynamicBAdapter,
  CpmmPricing,
  MultiTokenPool,
  CombinatorialScanner,
  BasketPricer,
  AtomicBasketCoordinator,
  CompensatoryUnwindHandler,
  TwoSidedQuoter,
  InventoryDeltaRebalancer,
  AdverseSelectionGuard,
  AmmRiskGuard,
  AmmMetricsRecorder,
  AmmAuditLogger,
  MasterAmmEngine,
  createMockMarket,
  createMockOrderbooks,
  createDefaultRiskContext,
  createDefaultPoolConfig,
} from './fixtures/amm-test-harness';
import type {
  CpmmReserves,
  DynamicBConfig,
  DynamicBState,
  MultiOutcomeMarket,
  TradeIntent,
  ExecutionLeg,
  MarketState,
  InventoryState,
} from './fixtures/amm-test-harness';

describe('Tier 1: Feature Coverage (F1 to F15 in Isolation)', () => {
  // ─── F1: LMSR Mathematical Pricing ──────────────────────────────────────────
  describe('F1: LMSR Mathematical Pricing', () => {
    it('F1.1: calculates uniform spot prices (1/n) when initial shares are equal', () => {
      const shares = [100, 100, 100, 100];
      const b = 500;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      expect(prices).toHaveLength(4);
      for (const p of prices) {
        expect(p).toBeCloseTo(0.25, 6);
      }
      const sum = prices.reduce((acc, p) => acc + p, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('F1.2: spot prices strictly sum to 1.0 under asymmetric outcome distribution', () => {
      const shares = [500, 200, 50, 10];
      const b = 300;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      const sum = prices.reduce((acc, p) => acc + p, 0);
      expect(sum).toBeCloseTo(1.0, 12);
      expect(prices[0]).toBeGreaterThan(prices[1]);
      expect(prices[1]).toBeGreaterThan(prices[2]);
      expect(prices[2]).toBeGreaterThan(prices[3]);
    });

    it('F1.3: cost function increases monotonically when purchasing shares', () => {
      const shares = [0, 0, 0];
      const b = 100;
      const costBefore = LmsrPricing.calculateCost(shares, b);

      const delta = [50, 0, 0];
      const tradeCost = LmsrPricing.calculateTradeCost(shares, delta, b);
      const costAfter = LmsrPricing.calculateCost([50, 0, 0], b);

      expect(tradeCost).toBeGreaterThan(0);
      expect(costAfter - costBefore).toBeCloseTo(tradeCost, 6);
    });

    it('F1.4: micro-trade cost computation avoids cancellation via log1p / expm1', () => {
      const shares = [1_000, 1_000];
      const b = 10_000;
      const tinyDelta = [1e-6, 0];

      const tradeCost = LmsrPricing.calculateTradeCost(shares, tinyDelta, b);
      // For p=0.5 and delta=1e-6, marginal price is 0.5, expected cost ~ 0.5 * 1e-6 = 5e-7
      expect(tradeCost).toBeGreaterThan(0);
      expect(tradeCost).toBeCloseTo(5e-7, 9);
    });

    it('F1.5: throws explicit error when parameter b is non-positive or shares empty', () => {
      expect(() => LmsrPricing.calculateCost([], 100)).toThrow(/empty/i);
      expect(() => LmsrPricing.calculateCost([10, 20], 0)).toThrow(/strictly positive/i);
      expect(() => LmsrPricing.calculateCost([10, 20], -5)).toThrow(/strictly positive/i);
    });
  });

  // ─── F2: Dynamic Liquidity b Adaptation ────────────────────────────────────
  describe('F2: Dynamic Liquidity b Adaptation', () => {
    const config: DynamicBConfig = {
      baseB: 1_000,
      minB: 500,
      maxB: 10_000,
      volumeScalingAlpha: 0.5,
      depthThresholdUsd: 10_000,
    };

    it('F2.1: adapts parameter b upward when rolling trading volume surges', () => {
      const state: DynamicBState = {
        currentB: 1_000,
        rollingVolumeUsd: 40_000,
        poolDepthUsd: 10_000,
        lastUpdatedMs: Date.now(),
      };

      const result = DynamicBAdapter.adaptB(state, config, 3);
      // targetB = 1000 * (1 + 0.5 * sqrt(40000 / 10000)) = 1000 * (1 + 0.5 * 2) = 2000
      expect(result.newB).toBeCloseTo(2_000, 2);
      expect(result.newB).toBeGreaterThan(result.previousB);
    });

    it('F2.2: enforces minB clamp when trading volume is zero', () => {
      const state: DynamicBState = {
        currentB: 1_000,
        rollingVolumeUsd: 0,
        poolDepthUsd: 10_000,
        lastUpdatedMs: Date.now(),
      };

      const result = DynamicBAdapter.adaptB(state, config, 3);
      expect(result.newB).toBe(1_000);
      expect(result.newB).toBeGreaterThanOrEqual(config.minB);
    });

    it('F2.3: enforces maxB ceiling under extreme volume stress', () => {
      const state: DynamicBState = {
        currentB: 1_000,
        rollingVolumeUsd: 50_000_000,
        poolDepthUsd: 10_000,
        lastUpdatedMs: Date.now(),
      };

      const result = DynamicBAdapter.adaptB(state, config, 3);
      expect(result.newB).toBe(config.maxB);
    });

    it('F2.4: proportional liability scaling preserves exact spot prices', () => {
      const oldShares = [100, 200, 400];
      const oldB = 1_000;
      const newB = 2_500;

      const prePrices = LmsrPricing.calculateSpotPrices(oldShares, oldB);
      const scaledShares = DynamicBAdapter.scaleLiabilities(oldShares, oldB, newB);
      const postPrices = LmsrPricing.calculateSpotPrices(scaledShares, newB);

      for (let i = 0; i < oldShares.length; i++) {
        expect(postPrices[i]).toBeCloseTo(prePrices[i], 10);
      }
    });

    it('F2.5: calculates worst-case market maker subsidy bound as b * ln(n)', () => {
      const b = 2_000;
      const outcomeCount = 4;
      const subsidy = DynamicBAdapter.calculateMaxSubsidy(b, outcomeCount);
      // subsidy = 2000 * ln(4) ~ 2772.5887
      expect(subsidy).toBeCloseTo(2_000 * Math.log(4), 4);
    });
  });

  // ─── F3: Binary CPMM Engine ────────────────────────────────────────────────
  describe('F3: Binary CPMM Engine', () => {
    let initialReserves: CpmmReserves;

    beforeEach(() => {
      initialReserves = {
        yesShares: 10_000,
        noShares: 10_000,
        collateralReserve: 10_000,
      };
    });

    it('F3.1: calculates spot prices with sum equal to 1.0', () => {
      const prices = CpmmPricing.calculateSpotPrices(initialReserves);
      expect(prices.spotPriceYes).toBe(0.5);
      expect(prices.spotPriceNo).toBe(0.5);
      expect(prices.spotPriceYes + prices.spotPriceNo).toBe(1.0);
    });

    it('F3.2: preserves constant product invariant (k_after >= k_before) on swap', () => {
      const kBefore = initialReserves.yesShares * initialReserves.noShares;
      const swap = CpmmPricing.calculateSwap('YES', 1_000, initialReserves, 30);
      const kAfter = swap.newReserves.yesShares * swap.newReserves.noShares;
      expect(kAfter).toBeGreaterThanOrEqual(kBefore);
      expect(swap.outputAmount).toBeGreaterThan(0);
      expect(swap.spotPriceNo).toBeGreaterThan(0.5);
      expect(swap.spotPriceYes).toBeLessThan(0.5);
    });

    it('F3.3: deducts swap trading fees and accumulates collateral reserve', () => {
      const swap = CpmmPricing.calculateSwap('NO', 500, initialReserves, 100); // 100 bps = 1%
      expect(swap.feeAmount).toBe(5);
      expect(swap.newReserves.collateralReserve).toBe(initialReserves.collateralReserve + 5);
    });

    it('F3.4: closed-form quadratic inverse for selling shares returns valid collateral', () => {
      const returned = CpmmPricing.calculateSellShares('YES', 500, initialReserves, 20);
      expect(returned).toBeGreaterThan(0);
      expect(returned).toBeLessThan(500);
    });

    it('F3.5: adding liquidity expands reserves proportionally maintaining 50/50 odds', () => {
      const result = CpmmPricing.addLiquidity(5_000, initialReserves);
      expect(result.newReserves.yesShares).toBe(15_000);
      expect(result.newReserves.noShares).toBe(15_000);
      const postPrices = CpmmPricing.calculateSpotPrices(result.newReserves);
      expect(postPrices.spotPriceYes).toBe(0.5);
      expect(postPrices.spotPriceNo).toBe(0.5);
    });
  });

  // ─── F4: Multi-Token Pool State Manager ────────────────────────────────────
  describe('F4: Multi-Token Pool State Manager', () => {
    let pool: MultiTokenPool;

    beforeEach(() => {
      pool = new MultiTokenPool(createDefaultPoolConfig(3));
    });

    it('F4.1: initializes with zero initial shares and correct outcome definitions', () => {
      expect(pool.getOutcomes()).toEqual(['OUT_1', 'OUT_2', 'OUT_3']);
      expect(pool.getShares()).toEqual([0, 0, 0]);
      expect(pool.getCollateral()).toBe(10_000);
    });

    it('F4.2: mints complete set by depositing collateral and issuing all outcome tokens', () => {
      const res = pool.mintCompleteSet(1_000);
      expect(res.sharesMinted).toBe(1_000);
      expect(pool.getCollateral()).toBe(11_000);
      expect(pool.getShares()).toEqual([1_000, 1_000, 1_000]);
    });

    it('F4.3: merges complete set by burning all outcome tokens and returning collateral', () => {
      pool.mintCompleteSet(2_000);
      const res = pool.mergeCompleteSet(800);
      expect(res.sharesBurned).toBe(800);
      expect(pool.getCollateral()).toBe(11_200);
      expect(pool.getShares()).toEqual([1_200, 1_200, 1_200]);
    });

    it('F4.4: executes trade on LMSR curve, updating shares, volume, and spot prices', () => {
      const tradeRes = pool.executeTrade({
        poolId: pool.getPoolId(),
        outcomeId: 'OUT_1',
        sharesDelta: 100,
      });

      expect(tradeRes.sharesDelta).toBe(100);
      expect(tradeRes.costUsd).toBeGreaterThan(0);
      expect(tradeRes.newSpotPrices['OUT_1']).toBeGreaterThan(tradeRes.newSpotPrices['OUT_2']);
      expect(pool.getVolumeUsd()).toBeGreaterThan(0);
      expect(pool.getTradeCount()).toBe(1);
    });

    it('F4.5: rejects trade when cost exceeds maxCostUsd slippage limit', () => {
      expect(() =>
        pool.executeTrade({
          poolId: pool.getPoolId(),
          outcomeId: 'OUT_1',
          sharesDelta: 100,
          maxCostUsd: 0.01, // unrealistically low slippage cap
        })
      ).toThrow(/exceeds maximum allowed/i);
    });
  });

  // ─── F5: Combinatorial Mispricing Scanner ──────────────────────────────────
  describe('F5: Combinatorial Mispricing Scanner', () => {
    it('F5.1: detects overpriced basket when sum of bids exceeds 1.00 + fee', () => {
      const market = createMockMarket(3, 1.08, 0.01); // sum of prices = 1.08
      const opp = CombinatorialScanner.scanBasket(market);

      expect(opp).not.toBeNull();
      expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');
      expect(opp?.sumPrices).toBeGreaterThan(1.0);
      expect(opp?.grossSpread).toBeGreaterThan(0);
    });

    it('F5.2: detects underpriced basket when sum of asks is below 1.00 - fee', () => {
      const market = createMockMarket(3, 0.92, 0.01); // sum of prices = 0.92
      const opp = CombinatorialScanner.scanBasket(market);

      expect(opp).not.toBeNull();
      expect(opp?.direction).toBe('UNDERPRICED_BUY_BASKET');
      expect(opp?.sumPrices).toBeLessThan(1.0);
      expect(opp?.grossSpread).toBeGreaterThan(0);
    });

    it('F5.3: returns null when market basket is fairly priced within fee band', () => {
      const market = createMockMarket(3, 1.00, 0.02);
      const opp = CombinatorialScanner.scanBasket(market);
      expect(opp).toBeNull();
    });

    it('F5.4: scales accurately across n=5 outcomes', () => {
      const market = createMockMarket(5, 1.12, 0.01);
      const opp = CombinatorialScanner.scanBasket(market);

      expect(opp).not.toBeNull();
      expect(opp?.outcomes).toHaveLength(5);
      expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');
    });

    it('F5.5: returns null for invalid market with less than 2 outcomes', () => {
      const market: MultiOutcomeMarket = {
        marketId: 'single-outcome',
        title: 'Invalid Single Outcome',
        outcomes: [
          {
            outcomeId: 'SOLO',
            bestBid: 0.5,
            bestAsk: 0.52,
            bidDepthUsd: 1000,
            askDepthUsd: 1000,
            spotPrice: 0.51,
          },
        ],
        collateralToken: 'USDC',
        feeBps: 20,
      };

      const opp = CombinatorialScanner.scanBasket(market);
      expect(opp).toBeNull();
    });
  });

  // ─── F6: Basket Pricer & Depth Walker ──────────────────────────────────────
  describe('F6: Basket Pricer & Depth Walker', () => {
    it('F6.1: walks orderbook depth and confirms profitability after gas and fees', () => {
      const market = createMockMarket(3, 1.08, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const pricerResult = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(pricerResult.executableSize).toBeGreaterThan(0);
      expect(pricerResult.isProfitable).toBe(true);
      expect(pricerResult.netProfitUsd).toBeGreaterThan(1.0);
    });

    it('F6.2: rejects trade when gas cost exceeds gross arbitrage spread', () => {
      const market = createMockMarket(3, 1.05, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const pricerResult = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 50.0, // High gas cost wipes out profits
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(pricerResult.isProfitable).toBe(false);
      expect(pricerResult.netProfitUsd).toBeLessThan(0);
    });

    it('F6.3: calculates capital required accurately for complete set minting', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const pricerResult = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 0.5,
        maxSlippageBps: 100,
      });

      expect(pricerResult.totalCapitalRequiredUsd).toBe(pricerResult.executableSize * 1.0);
    });

    it('F6.4: flags unprofitability when orderbook depth is zero', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const emptyObs = createMockOrderbooks(market, 0); // 0 levels

      const pricerResult = BasketPricer.priceBasket(opp, emptyObs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 0.5,
        maxSlippageBps: 100,
      });

      expect(pricerResult.executableSize).toBe(0);
      expect(pricerResult.isProfitable).toBe(false);
    });

    it('F6.5: computes effective leg prices weighted by fill sizes across tiers', () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const pricerResult = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 0.01,
        minProfitHurdleUsd: 0.1,
        maxSlippageBps: 100,
      });

      expect(Object.keys(pricerResult.effectiveLegPrices)).toHaveLength(2);
      for (const p of Object.values(pricerResult.effectiveLegPrices)) {
        expect(p).toBeGreaterThan(0);
      }
    });
  });

  // ─── F7: Atomic Multi-Leg Bundle Coordinator ───────────────────────────────
  describe('F7: Atomic Multi-Leg Bundle Coordinator', () => {
    it('F7.1: transitions from SUBMITTED to FILLED when all legs execute 100%', async () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp);
      expect(result.status).toBe('FILLED');
      expect(result.legs).toHaveLength(3);
      expect(result.legs.every((l) => l.status === 'FILLED')).toBe(true);
      expect(result.realizedPnlUsd).toBeGreaterThan(0);
    });

    it('F7.2: transitions to PARTIAL_UNWINDING -> UNWOUND when leg experiences partial fill', async () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_2: { fillRatio: 0.4 }, // Leg 2 partially fills
      });

      expect(result.status).toBe('UNWOUND');
      expect(result.unwindResult).toBeDefined();
      expect(result.unwindResult?.residualExposure).toBe(0);
    });

    it('F7.3: tracks latency per leg and aggregates total bundle latency', async () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_1: { fillRatio: 1.0, latencyMs: 25 },
        OUTCOME_2: { fillRatio: 1.0, latencyMs: 35 },
      });

      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(60);
    });

    it('F7.4: handles all legs failed gracefully', async () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_1: { fillRatio: 0, shouldFail: true },
        OUTCOME_2: { fillRatio: 0, shouldFail: true },
      });

      expect(result.status).toBe('FAILED');
      expect(result.totalFilledSize).toBe(0);
    });

    it('F7.5: records execution timestamps and bundle identifier', async () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp);
      expect(result.bundleId).toMatch(/^bundle-\d+/);
      expect(result.executedAt).toBeGreaterThan(0);
    });
  });

  // ─── F8: Compensatory Unwind Handler ────────────────────────────────────────
  describe('F8: Compensatory Unwind Handler', () => {
    it('F8.1: liquidates partially filled legs and guarantees zero residual exposure', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'leg-1',
          outcomeId: 'OUT_1',
          side: 'BUY',
          targetSize: 100,
          filledSize: 100,
          limitPrice: 0.4,
          avgFillPrice: 0.4,
          status: 'FILLED',
          latencyMs: 10,
        },
        {
          legId: 'leg-2',
          outcomeId: 'OUT_2',
          side: 'BUY',
          targetSize: 100,
          filledSize: 0,
          limitPrice: 0.6,
          avgFillPrice: 0.6,
          status: 'FAILED',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.residualExposure).toBe(0);
      expect(unwind.unwoundLegs).toHaveLength(1);
      expect(unwind.unwoundLegs[0].unwoundSize).toBe(100);
      expect(unwind.netUnwindLossUsd).toBeGreaterThan(0);
    });

    it('F8.2: handles empty filled legs with zero loss and zero exposure', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'leg-1',
          outcomeId: 'OUT_1',
          side: 'BUY',
          targetSize: 100,
          filledSize: 0,
          limitPrice: 0.5,
          avgFillPrice: 0.5,
          status: 'FAILED',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.residualExposure).toBe(0);
      expect(unwind.netUnwindLossUsd).toBe(0);
      expect(unwind.unwoundLegs).toHaveLength(0);
    });

    it('F8.3: unwinds multi-outcome partial fills simultaneously', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'leg-1',
          outcomeId: 'OUT_1',
          side: 'BUY',
          targetSize: 100,
          filledSize: 50,
          limitPrice: 0.3,
          avgFillPrice: 0.3,
          status: 'PARTIAL',
          latencyMs: 10,
        },
        {
          legId: 'leg-2',
          outcomeId: 'OUT_2',
          side: 'BUY',
          targetSize: 100,
          filledSize: 80,
          limitPrice: 0.4,
          avgFillPrice: 0.4,
          status: 'PARTIAL',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.unwoundLegs).toHaveLength(2);
      expect(unwind.totalUnwoundNotionalUsd).toBeGreaterThan(0);
      expect(unwind.residualExposure).toBe(0);
    });

    it('F8.4: applies unwind slippage penalty to realized loss computation', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'leg-1',
          outcomeId: 'OUT_1',
          side: 'BUY',
          targetSize: 100,
          filledSize: 100,
          limitPrice: 0.5,
          avgFillPrice: 0.5,
          status: 'FILLED',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      // Unwind sell price should be 0.5 * 0.98 = 0.49, realized loss = 0.01 * 100 = 1.0
      expect(unwind.unwoundLegs[0].unwindPrice).toBeCloseTo(0.49, 4);
      expect(unwind.netUnwindLossUsd).toBeCloseTo(1.0, 4);
    });

    it('F8.5: logs completion timestamp on unwind finish', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'leg-1',
          outcomeId: 'OUT_1',
          side: 'SELL',
          targetSize: 50,
          filledSize: 50,
          limitPrice: 0.7,
          avgFillPrice: 0.7,
          status: 'FILLED',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.completedAt).toBeGreaterThan(0);
    });
  });

  // ─── F9: Adaptive 2-Sided Quoting Agent ────────────────────────────────────
  describe('F9: Adaptive 2-Sided Quoting Agent', () => {
    const market: MarketState = {
      marketId: 'mkt-quote-1',
      spotPrices: { YES: 0.5, NO: 0.5 },
      volatility: 0.02,
      timeToMaturitySec: 86_400,
    };

    it('F9.1: produces balanced bid/ask quotes around 0.50 with zero inventory', () => {
      const inventory: InventoryState = {
        holdings: { YES: 0, NO: 0 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 0,
      };

      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
      expect(quotes.YES.bidPrice).toBeLessThan(0.5);
      expect(quotes.YES.askPrice).toBeGreaterThan(0.5);
      expect(quotes.YES.skewOffset).toBe(0);
    });

    it('F9.2: skews YES quote downward when holding long YES inventory', () => {
      const inventory: InventoryState = {
        holdings: { YES: 5_000, NO: 0 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 5_000,
      };

      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
      expect(quotes.YES.skewOffset).toBeGreaterThan(0);
      expect(quotes.YES.bidPrice).toBeLessThanOrEqual(0.48);
    });

    it('F9.3: skews YES quote upward when holding short YES inventory', () => {
      const inventory: InventoryState = {
        holdings: { YES: -5_000, NO: 0 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: -5_000,
      };

      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
      expect(quotes.YES.skewOffset).toBeLessThan(0);
      expect(quotes.YES.askPrice).toBeGreaterThanOrEqual(0.52);
    });

    it('F9.4: enforces tick size quantization (0.01 step)', () => {
      const inventory: InventoryState = {
        holdings: { YES: 123, NO: -456 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 0,
      };

      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
      const isTickAligned = (p: number) => Math.abs(Math.round(p * 100) - p * 100) < 1e-6;
      expect(isTickAligned(quotes.YES.bidPrice)).toBe(true);
      expect(isTickAligned(quotes.YES.askPrice)).toBe(true);
    });

    it('F9.5: enforces spread positivity (bidPrice < askPrice)', () => {
      const inventory: InventoryState = {
        holdings: { YES: 10_000, NO: 10_000 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 0,
      };

      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
      expect(quotes.YES.bidPrice).toBeLessThan(quotes.YES.askPrice);
      expect(quotes.NO.bidPrice).toBeLessThan(quotes.NO.askPrice);
    });
  });

  // ─── F10: Cross-Market Inventory Rebalancer ────────────────────────────────
  describe('F10: Cross-Market Inventory Rebalancer', () => {
    it('F10.1: generates rebalance order when inventory exceeds positive tolerance', () => {
      const inventory: InventoryState = {
        holdings: { YES: 800, NO: 0 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 800,
      };
      const refPrices = { YES: 0.5, NO: 0.5 };

      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      expect(orders).toHaveLength(1);
      expect(orders[0].side).toBe('SELL');
      expect(orders[0].targetQuantity).toBe(300); // 800 - 500
    });

    it('F10.2: generates rebalance order when inventory falls below negative tolerance', () => {
      const inventory: InventoryState = {
        holdings: { YES: -900, NO: 0 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: -900,
      };
      const refPrices = { YES: 0.5, NO: 0.5 };

      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      expect(orders).toHaveLength(1);
      expect(orders[0].side).toBe('BUY');
      expect(orders[0].targetQuantity).toBe(400); // |-900| - 500
    });

    it('F10.3: generates zero orders when inventory is within tolerance band', () => {
      const inventory: InventoryState = {
        holdings: { YES: 250, NO: -300 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: -50,
      };
      const refPrices = { YES: 0.5, NO: 0.5 };

      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      expect(orders).toHaveLength(0);
    });

    it('F10.4: sets urgency to HIGH when excess is more than double tolerance', () => {
      const inventory: InventoryState = {
        holdings: { YES: 2_000 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 2_000,
      };
      const refPrices = { YES: 0.5 };

      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      expect(orders[0].urgency).toBe('HIGH');
    });

    it('F10.5: calculates limit price with offset relative to reference price', () => {
      const inventory: InventoryState = {
        holdings: { YES: 1_000 },
        cashBalanceUsd: 10_000,
        netPortfolioDelta: 1_000,
      };
      const refPrices = { YES: 0.5 };

      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      // For SELL, limit price is 0.5 * 0.995 = 0.4975
      expect(orders[0].limitPrice).toBeCloseTo(0.4975, 4);
    });
  });

  // ─── F11: Adverse Selection & Toxic Flow Defense ───────────────────────────
  describe('F11: Adverse Selection & Toxic Flow Defense', () => {
    let guard: AdverseSelectionGuard;

    beforeEach(() => {
      guard = new AdverseSelectionGuard({
        bucketSizeVolume: 1_000,
        windowBucketCount: 5,
        vpinWarningThreshold: 0.4,
        vpinCriticalThreshold: 0.7,
        maxDynamicFeeMultiplier: 3.0,
      });
    });

    it('F11.1: maintains LOW toxicity and base fee under balanced order flow', () => {
      // 5 balanced buckets: 500 buy, 500 sell older than 200ms
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(500, 'BUY', baseTime + i * 20);
        guard.recordTrade(500, 'SELL', baseTime + i * 20 + 5);
      }

      const assessment = guard.assessFlow(100, 'BUY');
      expect(assessment.toxicityLevel).toBe('LOW');
      expect(assessment.vpin).toBe(0);
      expect(assessment.dynamicFeeMultiplier).toBe(1.0);
      expect(assessment.shouldTripwirePullQuotes).toBe(false);
    });

    it('F11.2: raises toxicity to HIGH and widens fee multiplier under directional flow', () => {
      // 5 one-sided buckets: 800 buy, 200 sell -> imbalance = 600 per bucket
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(800, 'BUY', baseTime + i * 20);
        guard.recordTrade(200, 'SELL', baseTime + i * 20 + 5);
      }

      const assessment = guard.assessFlow(50, 'BUY');
      expect(assessment.vpin).toBeCloseTo(0.6, 2);
      expect(assessment.toxicityLevel).toBe('HIGH');
      expect(assessment.dynamicFeeMultiplier).toBeGreaterThan(1.5);
    });

    it('F11.3: triggers CRITICAL tripwire and quote cancellation when VPIN >= 0.70', () => {
      // 5 completely one-sided buckets: 1000 buy, 0 sell -> imbalance = 1000 per bucket
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(1_000, 'BUY');
      }

      const assessment = guard.assessFlow(100, 'BUY');
      expect(assessment.vpin).toBeCloseTo(1.0, 2);
      expect(assessment.toxicityLevel).toBe('CRITICAL');
      expect(assessment.shouldTripwirePullQuotes).toBe(true);
      expect(assessment.dynamicFeeMultiplier).toBe(3.0);
    });

    it('F11.4: detects rapid toxic sweep burst in short time window (<100ms)', () => {
      // Immediate 3,000 volume burst exceeds sweepVelocityThreshold (2,500)
      const now = Date.now();
      guard.recordTrade(1_500, 'BUY', now);
      guard.recordTrade(1_500, 'BUY', now);

      const assessment = guard.assessFlow(100, 'BUY');
      expect(assessment.shouldTripwirePullQuotes).toBe(true);
      expect(assessment.reason).toBe('RAPID_SWEEP_BURST_DETECTED');
    });

    it('F11.5: enforces cooldown period on critical tripwire trigger', () => {
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(1_000, 'BUY');
      }
      const assessment = guard.assessFlow(100, 'BUY');
      expect(assessment.cooldownPeriodMs).toBe(30_000);
    });
  });

  // ─── F12: Pre-Trade Risk Gates ────────────────────────────────────────────
  describe('F12: Pre-Trade Risk Gates', () => {
    let context: ReturnType<typeof createDefaultRiskContext>;

    beforeEach(() => {
      context = createDefaultRiskContext(); // equity 100k, exposure 10k
    });

    it('F12.1: approves trade complying with all risk parameters', () => {
      const intent: TradeIntent = {
        intentId: 'intent-1',
        marketId: 'mkt-1',
        notionalUsd: 2_000,
        expectedEdgeBps: 50,
        venueLatencyMs: 45,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, context);
      expect(verdict.verdict).toBe('APPROVED');
      expect(verdict.allowedNotionalUsd).toBe(2_000);
    });

    it('F12.2: rejects trade exceeding 5% Quarter-Kelly position limit', () => {
      const intent: TradeIntent = {
        intentId: 'intent-2',
        marketId: 'mkt-1',
        notionalUsd: 10_000, // 10% of 100k equity > 5% max
        expectedEdgeBps: 50,
        venueLatencyMs: 45,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, context);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
      expect(verdict.allowedNotionalUsd).toBe(5_000); // 5% of 100k
    });

    it('F12.3: rejects trade when venue latency exceeds 500ms threshold', () => {
      const intent: TradeIntent = {
        intentId: 'intent-3',
        marketId: 'mkt-1',
        notionalUsd: 1_000,
        expectedEdgeBps: 50,
        venueLatencyMs: 550, // > 500ms
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, context);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('LATENCY_SPIKE_EXCEEDED');
    });

    it('F12.4: trips circuit breaker when cumulative daily drawdown exceeds 15%', () => {
      const drawdownContext = createDefaultRiskContext({
        peakDailyEquityUsd: 100_000,
        currentDailyEquityUsd: 82_000, // 18% drawdown > 15%
      });

      const intent: TradeIntent = {
        intentId: 'intent-4',
        marketId: 'mkt-1',
        notionalUsd: 1_000,
        expectedEdgeBps: 50,
        venueLatencyMs: 30,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, drawdownContext);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');
    });

    it('F12.5: rejects trade when cumulative pool exposure exceeds limit', () => {
      const exposureContext = createDefaultRiskContext({
        currentPoolExposureUsd: 48_000, // max is 50k
      });

      const intent: TradeIntent = {
        intentId: 'intent-5',
        marketId: 'mkt-1',
        notionalUsd: 4_000, // 48k + 4k = 52k > 50k
        expectedEdgeBps: 50,
        venueLatencyMs: 30,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, exposureContext);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('MAX_POOL_EXPOSURE_EXCEEDED');
      expect(verdict.allowedNotionalUsd).toBe(2_000);
    });
  });

  // ─── F13: Prometheus Metrics Instrumentation ──────────────────────────────
  describe('F13: Prometheus Metrics Instrumentation', () => {
    let metrics: AmmMetricsRecorder;

    beforeEach(() => {
      metrics = new AmmMetricsRecorder();
    });

    it('F13.1: records trade volume and arbitrage PnL accumulation', () => {
      metrics.recordTrade(1_500, 25.5);
      metrics.recordTrade(2_000, 34.0);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.tradeVolumeUsd).toBe(3_500);
      expect(snapshot.arbitragePnlUsd).toBe(59.5);
    });

    it('F13.2: sets and retrieves liquidity depth gauge', () => {
      metrics.setLiquidityDepth(50_000);
      expect(metrics.getSnapshot().liquidityDepthUsd).toBe(50_000);
    });

    it('F13.3: sets and retrieves VPIN toxicity level', () => {
      metrics.setVpinToxicity(0.42);
      expect(metrics.getSnapshot().vpinToxicity).toBe(0.42);
    });

    it('F13.4: tracks circuit breaker status flag', () => {
      expect(metrics.getSnapshot().circuitBreakerTripped).toBe(false);
      metrics.setCircuitBreakerTripped(true);
      expect(metrics.getSnapshot().circuitBreakerTripped).toBe(true);
    });

    it('F13.5: tracks active pools count', () => {
      metrics.setActivePoolsCount(4);
      expect(metrics.getSnapshot().activePoolsCount).toBe(4);
    });
  });

  // ─── F14: Hash-Chained Audit Logger ───────────────────────────────────────
  describe('F14: Hash-Chained Audit Logger', () => {
    let logger: AmmAuditLogger;

    beforeEach(() => {
      logger = new AmmAuditLogger('tier1-secret');
    });

    it('F14.1: logs initial genesis event with all-zero prevHash', () => {
      const record = logger.logEvent('POOL_INITIALIZED', { poolId: 'pool-1' });
      expect(record.index).toBe(0);
      expect(record.prevHash).toBe('0'.repeat(64));
      expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('F14.2: chains subsequent events referencing prior record hash', () => {
      const rec0 = logger.logEvent('POOL_INITIALIZED', { poolId: 'pool-1' });
      const rec1 = logger.logEvent('TRADE_EXECUTED', { cost: 100 });

      expect(rec1.index).toBe(1);
      expect(rec1.prevHash).toBe(rec0.hash);
      expect(rec1.hash).not.toBe(rec0.hash);
    });

    it('F14.3: verifyChain passes on pristine event sequence', () => {
      logger.logEvent('POOL_INITIALIZED', { poolId: 'pool-1' });
      logger.logEvent('TRADE_EXECUTED', { volume: 50 });
      logger.logEvent('RISK_GATE_APPROVED', { intentId: '1' });

      const check = logger.verifyChain();
      expect(check.valid).toBe(true);
    });

    it('F14.4: verifyChain returns true for empty chain', () => {
      const check = logger.verifyChain();
      expect(check.valid).toBe(true);
    });

    it('F14.5: deterministic HMAC generation matches independent calculation', () => {
      const rec = logger.logEvent('QUOTE_PUBLISHED', { price: 0.5 });
      const expected = logger.computeRecordHash(
        rec.prevHash,
        rec.index,
        rec.timestamp,
        rec.action,
        rec.details
      );
      expect(rec.hash).toBe(expected);
    });
  });

  // ─── F15: Master AMM Engine & Lifecycle ───────────────────────────────────
  describe('F15: Master AMM Engine & Lifecycle', () => {
    let engine: MasterAmmEngine;
    let poolConfig: ReturnType<typeof createDefaultPoolConfig>;
    let riskContext: ReturnType<typeof createDefaultRiskContext>;

    beforeEach(() => {
      engine = new MasterAmmEngine('master-test-key');
      poolConfig = createDefaultPoolConfig(3);
      riskContext = createDefaultRiskContext();
    });

    it('F15.1: initializes engine and registers multi-token pool into registry', () => {
      expect(engine.isActive()).toBe(true);
      const pool = engine.registerPool(poolConfig);
      expect(engine.getPool(poolConfig.poolId)).toBe(pool);
      expect(engine.getMetrics().getSnapshot().activePoolsCount).toBe(1);
    });

    it('F15.2: logs POOL_INITIALIZED event to audit logger upon pool registration', () => {
      engine.registerPool(poolConfig);
      const chain = engine.getAuditLogger().getChain();
      expect(chain).toHaveLength(1);
      expect(chain[0].action).toBe('POOL_INITIALIZED');
    });

    it('F15.3: routes trade through pre-trade risk guard and executes successfully', () => {
      engine.registerPool(poolConfig);
      const tradeRes = engine.executeTrade(
        {
          poolId: poolConfig.poolId,
          outcomeId: 'OUT_1',
          sharesDelta: 50,
        },
        riskContext
      );

      expect(tradeRes.success).toBe(true);
      expect(tradeRes.result?.sharesDelta).toBe(50);
      expect(engine.getMetrics().getSnapshot().tradeVolumeUsd).toBeGreaterThan(0);
    });

    it('F15.4: blocks trade when risk guard rejects intent and logs rejection', () => {
      engine.registerPool(poolConfig);
      const breakerContext = createDefaultRiskContext({
        currentDailyEquityUsd: 80_000, // 20% drawdown breach
      });

      const tradeRes = engine.executeTrade(
        {
          poolId: poolConfig.poolId,
          outcomeId: 'OUT_1',
          sharesDelta: 50,
        },
        breakerContext
      );

      expect(tradeRes.success).toBe(false);
      expect(tradeRes.rejection?.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');
    });

    it('F15.5: shuts down cleanly and stops active status', () => {
      expect(engine.isActive()).toBe(true);
      engine.shutdown();
      expect(engine.isActive()).toBe(false);
    });
  });
});
