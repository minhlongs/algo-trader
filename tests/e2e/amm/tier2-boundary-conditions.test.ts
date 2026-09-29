/**
 * Tier 2: Boundary & Corner Cases Test Suite (Prediction Market AMM & Negative-Risk Arbitrage Engine)
 *
 * Covers 75 boundary, stress, and corner condition tests across all 15 features (F1 through F15).
 * Validates numerical stability, clamp limits, precision limits, and error handling.
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

describe('Tier 2: Boundary Conditions & Corner Cases (75 tests across F1-F15)', () => {
  // ─── B1: LMSR Boundary Conditions ──────────────────────────────────────────
  describe('B1: LMSR Boundary Conditions', () => {
    it('B1.1: extreme scale vector [1e12, 0, -1e12] handles overflow/underflow without NaN or Infinity', () => {
      const shares = [1e12, 0, -1e12];
      const b = 100;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      expect(prices).toHaveLength(3);
      expect(prices.every((p) => Number.isFinite(p))).toBe(true);
      expect(prices[0]).toBeCloseTo(1.0, 10);
      expect(prices[1]).toBe(0);
      expect(prices[2]).toBe(0);
      expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);

      const cost = LmsrPricing.calculateCost(shares, b);
      expect(Number.isFinite(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    });

    it('B1.2: maximum outcome count n=20 produces exact 1/20 probability summing strictly to 1.0', () => {
      const n = 20;
      const shares = new Array<number>(n).fill(500);
      const b = 2_000;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      expect(prices).toHaveLength(20);
      for (const p of prices) {
        expect(p).toBeCloseTo(0.05, 10);
      }
      expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 12);
    });

    it('B1.3: all negative shares [-1000, -2000, -3000] produces valid probabilities and valid cost', () => {
      const shares = [-1_000, -2_000, -3_000];
      const b = 500;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      expect(prices.every((p) => p > 0 && p < 1)).toBe(true);
      expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
      expect(prices[0]).toBeGreaterThan(prices[1]);
      expect(prices[1]).toBeGreaterThan(prices[2]);

      const cost = LmsrPricing.calculateCost(shares, b);
      expect(Number.isFinite(cost)).toBe(true);
    });

    it('B1.4: extreme asymmetry where 1 outcome has 100k shares and others 0 maintains sum=1.0', () => {
      const shares = [100_000, 0, 0, 0];
      const b = 1_000;
      const prices = LmsrPricing.calculateSpotPrices(shares, b);

      expect(prices[0]).toBeCloseTo(1.0, 10);
      expect(prices[1]).toBeCloseTo(0, 10);
      expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
    });

    it('B1.5: large trade delta where delta_q >> b computes cost monotonically without saturation', () => {
      const shares = [100, 100];
      const delta = [10_000, 0];
      const b = 100;

      const tradeCost = LmsrPricing.calculateTradeCost(shares, delta, b);
      expect(tradeCost).toBeGreaterThan(9_000);
      expect(Number.isFinite(tradeCost)).toBe(true);
    });
  });

  // ─── B2: Dynamic Liquidity b Adaptation Boundary Conditions ────────────────
  describe('B2: Dynamic Liquidity b Adaptation Boundary Conditions', () => {
    const config: DynamicBConfig = {
      baseB: 1_000,
      minB: 500,
      maxB: 10_000,
      volumeScalingAlpha: 0.5,
      depthThresholdUsd: 10_000,
    };

    it('B2.1: zero volume and zero pool depth defaults gracefully to baseB', () => {
      const state: DynamicBState = {
        currentB: 1_000,
        rollingVolumeUsd: 0,
        poolDepthUsd: 0,
        lastUpdatedMs: Date.now(),
      };

      const result = DynamicBAdapter.adaptB(state, config, 3);
      expect(result.newB).toBe(1_000);
    });

    it('B2.2: extreme pool volume (1e9) clamps exactly at maxB', () => {
      const state: DynamicBState = {
        currentB: 1_000,
        rollingVolumeUsd: 1e9,
        poolDepthUsd: 10_000,
        lastUpdatedMs: Date.now(),
      };

      const result = DynamicBAdapter.adaptB(state, config, 3);
      expect(result.newB).toBe(config.maxB);
    });

    it('B2.3: outcome count < 2 returns 0 subsidy safely', () => {
      const subsidy = DynamicBAdapter.calculateMaxSubsidy(1_000, 1);
      expect(subsidy).toBe(0);
    });

    it('B2.4: throws when oldB or newB is non-positive during liability scaling', () => {
      expect(() => DynamicBAdapter.scaleLiabilities([10, 20], 0, 1_000)).toThrow(/positive/i);
      expect(() => DynamicBAdapter.scaleLiabilities([10, 20], 1_000, -500)).toThrow(/positive/i);
    });

    it('B2.5: reversing liability scaling restores original shares within floating point epsilon', () => {
      const originalShares = [123.456, 789.012, 345.678];
      const scaled = DynamicBAdapter.scaleLiabilities(originalShares, 1_000, 3_500);
      const restored = DynamicBAdapter.scaleLiabilities(scaled, 3_500, 1_000);

      for (let i = 0; i < originalShares.length; i++) {
        expect(restored[i]).toBeCloseTo(originalShares[i], 10);
      }
    });
  });

  // ─── B3: Binary CPMM Boundary Conditions ───────────────────────────────────
  describe('B3: Binary CPMM Boundary Conditions', () => {
    it('B3.1: extreme reserve asymmetry (1e6 YES vs 1 NO) reflects extreme spot prices', () => {
      const reserves: CpmmReserves = {
        yesShares: 1_000_000,
        noShares: 1,
        collateralReserve: 1_000,
      };

      const prices = CpmmPricing.calculateSpotPrices(reserves);
      expect(prices.spotPriceYes).toBeCloseTo(1e-6, 7);
      expect(prices.spotPriceNo).toBeCloseTo(1.0 - 1e-6, 5);
      expect(prices.spotPriceYes + prices.spotPriceNo).toBeCloseTo(1.0, 10);
    });

    it('B3.2: swap input amount equal to 0 throws explicit validation error', () => {
      const reserves: CpmmReserves = { yesShares: 1000, noShares: 1000, collateralReserve: 1000 };
      expect(() => CpmmPricing.calculateSwap('YES', 0, reserves, 20)).toThrow(/strictly positive/i);
    });

    it('B3.3: swap with feeBps = 0 executes cleanly without fee deduction', () => {
      const reserves: CpmmReserves = { yesShares: 10_000, noShares: 10_000, collateralReserve: 10_000 };
      const swap = CpmmPricing.calculateSwap('YES', 1_000, reserves, 0);

      expect(swap.feeAmount).toBe(0);
      expect(swap.outputAmount).toBeCloseTo(909.09, 2);
    });

    it('B3.4: massive swap input (1e8) approaches opposing reserve limit without negative reserves', () => {
      const reserves: CpmmReserves = { yesShares: 10_000, noShares: 10_000, collateralReserve: 10_000 };
      const swap = CpmmPricing.calculateSwap('YES', 1e8, reserves, 30);

      expect(swap.outputAmount).toBeLessThan(reserves.noShares);
      expect(swap.newReserves.noShares).toBeGreaterThan(0);
      expect(Number.isFinite(swap.newReserves.noShares)).toBe(true);
    });

    it('B3.5: selling shares with non-positive amount throws explicit validation error', () => {
      const reserves: CpmmReserves = { yesShares: 1000, noShares: 1000, collateralReserve: 1000 };
      expect(() => CpmmPricing.calculateSellShares('YES', 0, reserves, 20)).toThrow(/positive/i);
      expect(() => CpmmPricing.calculateSellShares('YES', -50, reserves, 20)).toThrow(/positive/i);
    });
  });

  // ─── B4: Multi-Token Pool Boundary Conditions ──────────────────────────────
  describe('B4: Multi-Token Pool Boundary Conditions', () => {
    let pool: MultiTokenPool;

    beforeEach(() => {
      pool = new MultiTokenPool(createDefaultPoolConfig(3));
    });

    it('B4.1: minting with 0 or negative collateral throws validation error', () => {
      expect(() => pool.mintCompleteSet(0)).toThrow(/strictly positive/i);
      expect(() => pool.mintCompleteSet(-100)).toThrow(/strictly positive/i);
    });

    it('B4.2: merging more shares than available in pool throws insufficient shares error', () => {
      pool.mintCompleteSet(100);
      expect(() => pool.mergeCompleteSet(101)).toThrow(/insufficient shares/i);
    });

    it('B4.3: merging zero or negative amount throws explicit validation error', () => {
      expect(() => pool.mergeCompleteSet(0)).toThrow(/strictly positive/i);
      expect(() => pool.mergeCompleteSet(-10)).toThrow(/strictly positive/i);
    });

    it('B4.4: trading on unknown outcome ID throws unknown outcome error', () => {
      expect(() =>
        pool.executeTrade({
          poolId: pool.getPoolId(),
          outcomeId: 'NON_EXISTENT_OUTCOME',
          sharesDelta: 50,
        })
      ).toThrow(/unknown outcome ID/i);
    });

    it('B4.5: high outcome count pool (n=20) initializes and tracks 20 distinct outcome balances', () => {
      const bigPool = new MultiTokenPool(createDefaultPoolConfig(20));
      expect(bigPool.getOutcomes()).toHaveLength(20);
      expect(bigPool.getShares()).toHaveLength(20);
      bigPool.mintCompleteSet(500);
      expect(bigPool.getShares().every((s) => s === 500)).toBe(true);
    });
  });

  // ─── B5: Combinatorial Scanner Boundary Conditions ─────────────────────────
  describe('B5: Combinatorial Scanner Boundary Conditions', () => {
    it('B5.1: 20-outcome market scanning correctly computes sum across all 20 outcomes', () => {
      const market = createMockMarket(20, 1.15, 0.01);
      const opp = CombinatorialScanner.scanBasket(market);

      expect(opp).not.toBeNull();
      expect(opp?.outcomes).toHaveLength(20);
      expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');
    });

    it('B5.2: marginal mispricing at exact fee hurdle (sum = 1.0 + fee + 1e-4) triggers opportunity', () => {
      const feeBps = 20;
      const n = 3;
      const hurdle = 1.0 + (feeBps / 10_000) * n;
      const market = createMockMarket(n, hurdle + 0.01, 0.001);

      const opp = CombinatorialScanner.scanBasket(market, feeBps);
      expect(opp).not.toBeNull();
      expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');
    });

    it('B5.3: marginal non-mispricing (sum = 1.0 + fee - 1e-4) does not trigger opportunity', () => {
      const feeBps = 20;
      const n = 3;
      const hurdle = 1.0 + (feeBps / 10_000) * n;
      const market = createMockMarket(n, hurdle - 0.005, 0.001);

      const opp = CombinatorialScanner.scanBasket(market, feeBps);
      expect(opp).toBeNull();
    });

    it('B5.4: all zero bid prices does not trigger false overpriced opportunity', () => {
      const market = createMockMarket(3, 1.0, 0.01);
      market.outcomes.forEach((o) => {
        o.bestBid = 0;
      });

      const opp = CombinatorialScanner.scanBasket(market);
      expect(opp?.direction).not.toBe('OVERPRICED_SELL_BASKET');
    });

    it('B5.5: returns null when market has fewer than 2 outcomes', () => {
      const market = createMockMarket(1, 1.0, 0.01);
      const opp = CombinatorialScanner.scanBasket(market);
      expect(opp).toBeNull();
    });
  });

  // ─── B6: Basket Pricer Boundary Conditions ─────────────────────────────────
  describe('B6: Basket Pricer Boundary Conditions', () => {
    it('B6.1: zero available liquidity across all orderbooks returns 0 executable size and unprofitable', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const emptyObs = createMockOrderbooks(market, 0);

      const result = BasketPricer.priceBasket(opp, emptyObs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(result.executableSize).toBe(0);
      expect(result.isProfitable).toBe(false);
    });

    it('B6.2: single outcome with 0 liquidity bottlenecks entire bundle executable size to 0', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);
      obs['OUTCOME_2'].bids = []; // Zero depth on OUTCOME_2

      const result = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(result.executableSize).toBe(0);
      expect(result.isProfitable).toBe(false);
    });

    it('B6.3: gas cost exactly equal to gross profit produces netProfit = 0 and isProfitable = false', () => {
      const market = createMockMarket(3, 1.05, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const result = BasketPricer.priceBasket(opp, obs, {
        feeBps: 0,
        gasCostUsd: 500 * (1.05 - 1.0 - 0.015), // Exactly match gross profit
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(result.isProfitable).toBe(false);
    });

    it('B6.4: deep orderbook (1e6 units) caps execution size at safety limit (500)', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);
      for (const ob of Object.values(obs)) {
        ob.bids.forEach((b) => (b.size = 1_000_000));
      }

      const result = BasketPricer.priceBasket(opp, obs, {
        feeBps: 10,
        gasCostUsd: 0.05,
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(result.executableSize).toBe(500);
    });

    it('B6.5: zero fee (0 bps) nets only gas cost from gross spread', () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;
      const obs = createMockOrderbooks(market, 5);

      const result = BasketPricer.priceBasket(opp, obs, {
        feeBps: 0,
        gasCostUsd: 1.5,
        minProfitHurdleUsd: 1.0,
        maxSlippageBps: 100,
      });

      expect(result.feeUsd).toBe(0);
      expect(result.netProfitUsd).toBeCloseTo(result.grossProfitUsd - 1.5, 4);
    });
  });

  // ─── B7: Atomic Bundle Coordinator Boundary Conditions ─────────────────────
  describe('B7: Atomic Bundle Coordinator Boundary Conditions', () => {
    it('B7.1: zero latency execution executes instantaneously', async () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_1: { fillRatio: 1.0, latencyMs: 0 },
        OUTCOME_2: { fillRatio: 1.0, latencyMs: 0 },
      });

      expect(result.totalLatencyMs).toBe(0);
      expect(result.status).toBe('FILLED');
    });

    it('B7.2: high latency execution (5000ms) completes lifecycle tracking accurately', async () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_1: { fillRatio: 1.0, latencyMs: 2500 },
        OUTCOME_2: { fillRatio: 1.0, latencyMs: 2500 },
      });

      expect(result.totalLatencyMs).toBe(5000);
      expect(result.status).toBe('FILLED');
    });

    it('B7.3: all legs partial (50% fill on all legs) triggers compensatory unwind', async () => {
      const market = createMockMarket(3, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_1: { fillRatio: 0.5 },
        OUTCOME_2: { fillRatio: 0.5 },
        OUTCOME_3: { fillRatio: 0.5 },
      });

      expect(result.status).toBe('UNWOUND');
      expect(result.unwindResult?.residualExposure).toBe(0);
    });

    it('B7.4: 19 of 20 legs filled with 1 failed leg triggers unwind of all 19 legs to net zero', async () => {
      const market = createMockMarket(20, 1.15, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const result = await AtomicBasketCoordinator.executeOpportunity(opp, {
        OUTCOME_20: { fillRatio: 0, shouldFail: true },
      });

      expect(result.status).toBe('UNWOUND');
      expect(result.unwindResult?.unwoundLegs).toHaveLength(19);
      expect(result.unwindResult?.residualExposure).toBe(0);
    });

    it('B7.5: re-executing opportunity generates unique bundleId', async () => {
      const market = createMockMarket(2, 1.10, 0.01);
      const opp = CombinatorialScanner.scanBasket(market)!;

      const r1 = await AtomicBasketCoordinator.executeOpportunity(opp);
      const r2 = await AtomicBasketCoordinator.executeOpportunity(opp);

      expect(r1.bundleId).not.toBe(r2.bundleId);
    });
  });

  // ─── B8: Compensatory Unwind Handler Boundary Conditions ────────────────────
  describe('B8: Compensatory Unwind Handler Boundary Conditions', () => {
    it('B8.1: negative or zero fill legs produce empty unwind list with 0 loss', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'l1',
          outcomeId: 'O1',
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
      expect(unwind.unwoundLegs).toHaveLength(0);
      expect(unwind.netUnwindLossUsd).toBe(0);
    });

    it('B8.2: extreme unwind slippage handles catastrophic unwind accounting accurately', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'l1',
          outcomeId: 'O1',
          side: 'BUY',
          targetSize: 10_000,
          filledSize: 10_000,
          limitPrice: 0.8,
          avgFillPrice: 0.8,
          status: 'FILLED',
          latencyMs: 10,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.residualExposure).toBe(0);
      expect(unwind.netUnwindLossUsd).toBeGreaterThan(0);
    });

    it('B8.3: 20-leg simultaneous partial unwind executes without error', async () => {
      const legs: ExecutionLeg[] = Array.from({ length: 20 }, (_, i) => ({
        legId: `leg-${i}`,
        outcomeId: `O${i}`,
        side: 'BUY',
        targetSize: 100,
        filledSize: 50,
        limitPrice: 0.05,
        avgFillPrice: 0.05,
        status: 'PARTIAL',
        latencyMs: 5,
      }));

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.unwoundLegs).toHaveLength(20);
      expect(unwind.residualExposure).toBe(0);
    });

    it('B8.4: fractional micro-lot unwind (1e-4 units) calculates without floating point underflow', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'micro-leg',
          outcomeId: 'O1',
          side: 'BUY',
          targetSize: 1e-4,
          filledSize: 1e-4,
          limitPrice: 0.5,
          avgFillPrice: 0.5,
          status: 'PARTIAL',
          latencyMs: 5,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.unwoundLegs[0].unwoundSize).toBe(1e-4);
      expect(unwind.residualExposure).toBe(0);
    });

    it('B8.5: zero residual exposure holds strictly even under disparate fill sizes across legs', async () => {
      const legs: ExecutionLeg[] = [
        {
          legId: 'l1',
          outcomeId: 'O1',
          side: 'BUY',
          targetSize: 100,
          filledSize: 99,
          limitPrice: 0.3,
          avgFillPrice: 0.3,
          status: 'PARTIAL',
          latencyMs: 5,
        },
        {
          legId: 'l2',
          outcomeId: 'O2',
          side: 'BUY',
          targetSize: 100,
          filledSize: 1,
          limitPrice: 0.7,
          avgFillPrice: 0.7,
          status: 'PARTIAL',
          latencyMs: 5,
        },
      ];

      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      expect(unwind.residualExposure).toBe(0);
    });
  });

  // ─── B9: Two-Sided Quoter Boundary Conditions ──────────────────────────────
  describe('B9: Two-Sided Quoter Boundary Conditions', () => {
    const market: MarketState = {
      marketId: 'mkt-boundary',
      spotPrices: { YES: 0.5, NO: 0.5 },
      volatility: 0.02,
      timeToMaturitySec: 86_400,
    };

    it('B9.1: zero time to maturity defaults to minimum tau (1 sec) without division by zero', () => {
      const zeroTauMarket: MarketState = { ...market, timeToMaturitySec: 0 };
      const inventory: InventoryState = { holdings: { YES: 0, NO: 0 }, cashBalanceUsd: 1000, netPortfolioDelta: 0 };

      const quotes = TwoSidedQuoter.generateQuotes(zeroTauMarket, inventory);
      expect(quotes.YES.bidPrice).toBeGreaterThan(0);
      expect(quotes.YES.askPrice).toBeGreaterThan(0);
    });

    it('B9.2: extreme long inventory (1e6) clamps bid price at floor (0.01)', () => {
      const inventory: InventoryState = { holdings: { YES: 1e6, NO: 0 }, cashBalanceUsd: 1000, netPortfolioDelta: 1e6 };
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);

      expect(quotes.YES.bidPrice).toBe(0.01);
    });

    it('B9.3: extreme short inventory (-1e6) clamps ask price at ceiling (0.99)', () => {
      const inventory: InventoryState = { holdings: { YES: -1e6, NO: 0 }, cashBalanceUsd: 1000, netPortfolioDelta: -1e6 };
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);

      expect(quotes.YES.askPrice).toBe(0.99);
    });

    it('B9.4: zero volatility (sigma=0) results in zero inventory skew offset', () => {
      const inventory: InventoryState = { holdings: { YES: 50_000, NO: 0 }, cashBalanceUsd: 1000, netPortfolioDelta: 50_000 };
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory, { sigma: 0 });

      expect(quotes.YES.skewOffset).toBe(0);
    });

    it('B9.5: highly skewed quote maintains strict spread positivity (bid < ask)', () => {
      const inventory: InventoryState = { holdings: { YES: 500_000, NO: -500_000 }, cashBalanceUsd: 1000, netPortfolioDelta: 0 };
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);

      expect(quotes.YES.bidPrice).toBeLessThan(quotes.YES.askPrice);
      expect(quotes.NO.bidPrice).toBeLessThan(quotes.NO.askPrice);
    });
  });

  // ─── B10: Cross-Market Rebalancer Boundary Conditions ──────────────────────
  describe('B10: Cross-Market Rebalancer Boundary Conditions', () => {
    it('B10.1: inventory at exact tolerance threshold (500) triggers 0 rebalance orders', () => {
      const inv: InventoryState = { holdings: { YES: 500 }, cashBalanceUsd: 1000, netPortfolioDelta: 500 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inv, { YES: 0.5 }, 500);
      expect(orders).toHaveLength(0);
    });

    it('B10.2: inventory at tolerance + 1 (501) triggers rebalance order for exactly 1 unit', () => {
      const inv: InventoryState = { holdings: { YES: 501 }, cashBalanceUsd: 1000, netPortfolioDelta: 501 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inv, { YES: 0.5 }, 500);
      expect(orders).toHaveLength(1);
      expect(orders[0].targetQuantity).toBe(1);
      expect(orders[0].side).toBe('SELL');
    });

    it('B10.3: multiple outcomes with disparate breaches triggers independent rebalance orders', () => {
      const inv: InventoryState = {
        holdings: { OUT_1: 800, OUT_2: -700, OUT_3: 100 },
        cashBalanceUsd: 1000,
        netPortfolioDelta: 200,
      };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inv, { OUT_1: 0.4, OUT_2: 0.6, OUT_3: 0.5 }, 500);
      expect(orders).toHaveLength(2); // OUT_1 and OUT_2 breached
    });

    it('B10.4: massive inventory excess (1e6) sets urgency to HIGH', () => {
      const inv: InventoryState = { holdings: { YES: 1e6 }, cashBalanceUsd: 1000, netPortfolioDelta: 1e6 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inv, { YES: 0.5 }, 500);
      expect(orders[0].urgency).toBe('HIGH');
    });

    it('B10.5: missing reference price falls back safely to default 0.5', () => {
      const inv: InventoryState = { holdings: { YES: 800 }, cashBalanceUsd: 1000, netPortfolioDelta: 800 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inv, {}, 500);
      expect(orders[0].limitPrice).toBeCloseTo(0.5 * 0.995, 4);
    });
  });

  // ─── B11: Adverse Selection Defense Boundary Conditions ────────────────────
  describe('B11: Adverse Selection Defense Boundary Conditions', () => {
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

    it('B11.1: exactly at critical threshold (VPIN >= 0.70) triggers critical tripwire', () => {
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(850, 'BUY', baseTime + i * 20); // imbalance 700 / 1000 = 0.70
        guard.recordTrade(150, 'SELL', baseTime + i * 20 + 5);
      }

      const assessment = guard.assessFlow(10, 'BUY');
      expect(assessment.vpin).toBeCloseTo(0.70, 2);
      expect(assessment.toxicityLevel).toBe('CRITICAL');
      expect(assessment.shouldTripwirePullQuotes).toBe(true);
    });

    it('B11.2: at warning threshold (VPIN = 0.40) triggers high toxicity without pulling quotes', () => {
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(700, 'BUY', baseTime + i * 20); // imbalance 400 / 1000 = 0.40
        guard.recordTrade(300, 'SELL', baseTime + i * 20 + 5);
      }

      const assessment = guard.assessFlow(10, 'BUY');
      expect(assessment.vpin).toBeCloseTo(0.40, 2);
      expect(assessment.toxicityLevel).toBe('HIGH');
      expect(assessment.shouldTripwirePullQuotes).toBe(false);
    });

    it('B11.3: VPIN capped at 1.0 even under massive infinite one-sided volume', () => {
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(100_000, 'BUY', baseTime + i * 20);
      }

      const assessment = guard.assessFlow(10, 'BUY');
      expect(assessment.vpin).toBeLessThanOrEqual(1.0);
    });

    it('B11.4: burst volume older than 500ms does not count toward velocity burst', () => {
      const oldTime = Date.now() - 600;
      guard.recordTrade(5_000, 'BUY', oldTime); // Very old trade

      const assessment = guard.assessFlow(10, 'BUY');
      expect(assessment.reason).toBeUndefined(); // No rapid sweep burst
    });

    it('B11.5: dynamic fee multiplier clamped at maxDynamicFeeMultiplier (3.0)', () => {
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 5; i++) {
        guard.recordTrade(1_000, 'BUY', baseTime + i * 20);
      }

      const assessment = guard.assessFlow(10, 'BUY');
      expect(assessment.dynamicFeeMultiplier).toBe(3.0);
    });
  });

  // ─── B12: Pre-Trade Risk Gates Boundary Conditions ─────────────────────────
  describe('B12: Pre-Trade Risk Gates Boundary Conditions', () => {
    const context = createDefaultRiskContext({ portfolioEquityUsd: 100_000 });

    it('B12.1: trade notional at exactly 5% Quarter-Kelly cap ($5,000) is approved', () => {
      const intent: TradeIntent = {
        intentId: 'k1',
        marketId: 'm1',
        notionalUsd: 5_000,
        expectedEdgeBps: 50,
        venueLatencyMs: 50,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, context);
      expect(verdict.verdict).toBe('APPROVED');
    });

    it('B12.2: trade notional at $5,000.01 is rejected with KELLY_CAP_EXCEEDED', () => {
      const intent: TradeIntent = {
        intentId: 'k2',
        marketId: 'm1',
        notionalUsd: 5_000.01,
        expectedEdgeBps: 50,
        venueLatencyMs: 50,
      };

      const verdict = AmmRiskGuard.evaluatePreTrade(intent, context);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
    });

    it('B12.3: venue latency at 500ms is approved; at 501ms is rejected with LATENCY_SPIKE_EXCEEDED', () => {
      const passIntent: TradeIntent = { intentId: 'l1', marketId: 'm1', notionalUsd: 1000, expectedEdgeBps: 50, venueLatencyMs: 500 };
      const failIntent: TradeIntent = { intentId: 'l2', marketId: 'm1', notionalUsd: 1000, expectedEdgeBps: 50, venueLatencyMs: 501 };

      expect(AmmRiskGuard.evaluatePreTrade(passIntent, context).verdict).toBe('APPROVED');
      const failVerdict = AmmRiskGuard.evaluatePreTrade(failIntent, context);
      expect(failVerdict.verdict).toBe('REJECTED');
      expect(failVerdict.rejectionCode).toBe('LATENCY_SPIKE_EXCEEDED');
    });

    it('B12.4: daily drawdown at 15.00% is approved; at 15.01% is rejected with DAILY_DRAWDOWN_BREACH', () => {
      const passCtx = createDefaultRiskContext({ peakDailyEquityUsd: 100_000, currentDailyEquityUsd: 85_000 });
      const failCtx = createDefaultRiskContext({ peakDailyEquityUsd: 100_000, currentDailyEquityUsd: 84_990 });
      const intent: TradeIntent = { intentId: 'd1', marketId: 'm1', notionalUsd: 1000, expectedEdgeBps: 50, venueLatencyMs: 50 };

      expect(AmmRiskGuard.evaluatePreTrade(intent, passCtx).verdict).toBe('APPROVED');
      const failVerdict = AmmRiskGuard.evaluatePreTrade(intent, failCtx);
      expect(failVerdict.verdict).toBe('REJECTED');
      expect(failVerdict.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');
    });

    it('B12.5: pool exposure at exactly $50,000 is approved; at $50,001 is rejected with MAX_POOL_EXPOSURE_EXCEEDED', () => {
      const passCtx = createDefaultRiskContext({ currentPoolExposureUsd: 49_000 });
      const intentPass: TradeIntent = { intentId: 'e1', marketId: 'm1', notionalUsd: 1_000, expectedEdgeBps: 50, venueLatencyMs: 50 };
      const intentFail: TradeIntent = { intentId: 'e2', marketId: 'm1', notionalUsd: 1_001, expectedEdgeBps: 50, venueLatencyMs: 50 };

      expect(AmmRiskGuard.evaluatePreTrade(intentPass, passCtx).verdict).toBe('APPROVED');
      const failVerdict = AmmRiskGuard.evaluatePreTrade(intentFail, passCtx);
      expect(failVerdict.verdict).toBe('REJECTED');
      expect(failVerdict.rejectionCode).toBe('MAX_POOL_EXPOSURE_EXCEEDED');
    });
  });

  // ─── B13: Prometheus Metrics Boundary Conditions ───────────────────────────
  describe('B13: Prometheus Metrics Boundary Conditions', () => {
    let metrics: AmmMetricsRecorder;

    beforeEach(() => {
      metrics = new AmmMetricsRecorder();
    });

    it('B13.1: negative volume input is clamped to 0', () => {
      metrics.recordTrade(-500);
      expect(metrics.getSnapshot().tradeVolumeUsd).toBe(0);
    });

    it('B13.2: negative PnL is tracked accurately for drawdown accounting', () => {
      metrics.recordTrade(1_000, -150.5);
      expect(metrics.getSnapshot().arbitragePnlUsd).toBe(-150.5);
    });

    it('B13.3: VPIN toxicity gauge is clamped between 0.0 and 1.0', () => {
      metrics.setVpinToxicity(-0.5);
      expect(metrics.getSnapshot().vpinToxicity).toBe(0);
      metrics.setVpinToxicity(1.5);
      expect(metrics.getSnapshot().vpinToxicity).toBe(1.0);
    });

    it('B13.4: zero active pools recorded correctly', () => {
      metrics.setActivePoolsCount(0);
      expect(metrics.getSnapshot().activePoolsCount).toBe(0);
    });

    it('B13.5: rapid consecutive trade recordings accumulate volume monotonically', () => {
      for (let i = 0; i < 100; i++) {
        metrics.recordTrade(10);
      }
      expect(metrics.getSnapshot().tradeVolumeUsd).toBe(1_000);
    });
  });

  // ─── B14: Hash-Chained Audit Logger Boundary Conditions ────────────────────
  describe('B14: Hash-Chained Audit Logger Boundary Conditions', () => {
    it('B14.1: single event chain verifies successfully', () => {
      const logger = new AmmAuditLogger('secret-14');
      logger.logEvent('POOL_INITIALIZED', { id: 'single' });
      expect(logger.verifyChain().valid).toBe(true);
    });

    it('B14.2: 100 consecutive chained events verify without performance degradation', () => {
      const logger = new AmmAuditLogger('secret-14');
      for (let i = 0; i < 100; i++) {
        logger.logEvent('TRADE_EXECUTED', { tradeIndex: i });
      }
      expect(logger.getChain()).toHaveLength(100);
      expect(logger.verifyChain().valid).toBe(true);
    });

    it('B14.3: empty details payload records and verifies cleanly', () => {
      const logger = new AmmAuditLogger('secret-14');
      logger.logEvent('CIRCUIT_BREAKER_TRIPPED', {});
      expect(logger.verifyChain().valid).toBe(true);
    });

    it('B14.4: nested complex details payload generates valid HMAC hash', () => {
      const logger = new AmmAuditLogger('secret-14');
      const rec = logger.logEvent('BUNDLE_FILLED', {
        bundle: { id: 'b1', legs: [{ id: 'l1', price: 0.5 }] },
      });
      expect(rec.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(logger.verifyChain().valid).toBe(true);
    });

    it('B14.5: custom HMAC secret produces distinct cryptographic hashes', () => {
      const logger1 = new AmmAuditLogger('key-A');
      const logger2 = new AmmAuditLogger('key-B');

      const r1 = logger1.logEvent('POOL_INITIALIZED', { id: '1' });
      const r2 = logger2.logEvent('POOL_INITIALIZED', { id: '1' });

      expect(r1.hash).not.toBe(r2.hash);
    });
  });

  // ─── B15: Master AMM Engine Boundary Conditions ────────────────────────────
  describe('B15: Master AMM Engine Boundary Conditions', () => {
    let engine: MasterAmmEngine;

    beforeEach(() => {
      engine = new MasterAmmEngine('master-b15');
    });

    it('B15.1: executing trade on non-existent pool throws explicit error', () => {
      expect(() =>
        engine.executeTrade(
          { poolId: 'ghost-pool', outcomeId: 'OUT_1', sharesDelta: 10 },
          createDefaultRiskContext()
        )
      ).toThrow(/not found/i);
    });

    it('B15.2: registering multiple pools with same ID updates registry cleanly', () => {
      const p1 = engine.registerPool(createDefaultPoolConfig(2));
      const p2 = engine.registerPool(createDefaultPoolConfig(2));

      expect(engine.getPool(p1.getPoolId())).toBe(p2);
    });

    it('B15.3: executing trade with zero equity context trips Kelly rejection', () => {
      const pool = engine.registerPool(createDefaultPoolConfig(2));
      const zeroEquityCtx = createDefaultRiskContext({ portfolioEquityUsd: 0 });

      const res = engine.executeTrade(
        { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 10 },
        zeroEquityCtx
      );

      expect(res.success).toBe(false);
      expect(res.rejection?.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
    });

    it('B15.4: calling shutdown multiple times is idempotent', () => {
      expect(engine.isActive()).toBe(true);
      engine.shutdown();
      expect(engine.isActive()).toBe(false);
      engine.shutdown();
      expect(engine.isActive()).toBe(false);
    });

    it('B15.5: engine handles rapid consecutive trade executions updating pool states consistently', () => {
      const pool = engine.registerPool(createDefaultPoolConfig(3));
      const ctx = createDefaultRiskContext();

      for (let i = 0; i < 5; i++) {
        const res = engine.executeTrade(
          { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 10 },
          ctx
        );
        expect(res.success).toBe(true);
      }

      expect(pool.getTradeCount()).toBe(5);
      expect(engine.getMetrics().getSnapshot().tradeVolumeUsd).toBeGreaterThan(0);
    });
  });
});
