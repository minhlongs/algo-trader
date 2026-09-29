import { describe, expect, it } from 'vitest';
import {
  CpmmPricing,
  DynamicBAdapter,
  HybridOrderRouter,
  LmsrPricing,
  MultiTokenPool,
  VirtualReserveTracker,
} from '../../../src/desk/amm';

describe('Milestone 1 — AMM Pricing & Pool Engine', () => {
  describe('LMSR Pricing Engine', () => {
    it('computes overflow-free cost and spot prices for extreme liabilities & n >= 10', () => {
      for (const n of [10, 20, 50]) {
        const b = 500;
        const extremeLiabilities = new Array(n).fill(0).map((_, i) => (i === 0 ? 1e6 : -1e5 + i * 100));
        const cost = LmsrPricing.calculateCost(extremeLiabilities, b);
        expect(Number.isFinite(cost)).toBe(true);
        expect(isNaN(cost)).toBe(false);

        const prices = LmsrPricing.calculateSpotPrices(extremeLiabilities, b);
        expect(prices.length).toBe(n);
        const sum = prices.reduce((acc, p) => acc + p, 0);
        expect(Math.abs(sum - 1.0)).toBeLessThan(1e-12);
        expect(prices[0]).toBeGreaterThan(0.99); // highest liability outcome dominates
      }
    });

    it('preserves micro-trade precision using log1p/expm1 and satisfies budget inversion', () => {
      const b = 1000;
      const liabilities = [100, 200, 150];
      const deltaShares = [1e-8, 0, 0];
      const microCost = LmsrPricing.calculateTradeCost(liabilities, deltaShares, b);
      expect(microCost).toBeGreaterThan(0);
      expect(Number.isFinite(microCost)).toBe(true);

      const budget = 50;
      const sharesAcquired = LmsrPricing.calculateSharesForBudget(liabilities, 0, budget, b);
      const simulatedCost = LmsrPricing.calculateTradeCost(liabilities, [sharesAcquired, 0, 0], b);
      expect(Math.abs(simulatedCost - budget)).toBeLessThan(1e-9);

      const wcl = LmsrPricing.calculateWorstCaseLoss(3, b);
      expect(wcl).toBeCloseTo(b * Math.log(3), 10);
    });
  });

  describe('Dynamic b Adapter', () => {
    it('scales liabilities proportionally, preserving spot prices identically and computing collateral delta', () => {
      const currentB = 1000;
      const currentLiabilities = [500, 300, 200];
      const config = {
        baseB: 1000,
        minB: 500,
        maxB: 5000,
        volumeTargetUsd: 10000,
        volumeSensitivity: 0.5,
        beta: 1.0,
      };

      const res = DynamicBAdapter.adjustB({
        currentB,
        currentLiabilities,
        availableCollateralUsdc: 10000,
        rolling24hVolumeUsdc: 20000,
        config,
      });

      expect(res.newB).toBe(2000);
      expect(res.scalingFactor).toBe(2.0);
      expect(res.scaledLiabilities).toEqual([1000, 600, 400]);
      expect(DynamicBAdapter.verifyPriceInvariance(res.spotPricesBefore, res.spotPricesAfter)).toBe(true);
      expect(res.collateralDeltaUsdc).toBeGreaterThan(0);
    });
  });

  describe('CPMM Pricing Engine', () => {
    it('maintains constant product k and guarantees zero round-trip leak on sell', () => {
      const initial = { yesReserve: 2000, noReserve: 1000, k: 2000000 };
      const prices = CpmmPricing.calculateSpotPrices(initial);
      expect(prices.yesPrice + prices.noPrice).toBeCloseTo(1.0, 12);
      expect(prices.yesPrice).toBeCloseTo(1000 / 3000, 10);

      // Buy YES with 100 USDC (0 fee)
      const buyRes = CpmmPricing.calculateBuy('YES', 100, initial, 0);
      expect(buyRes.newReserves.yesReserve * buyRes.newReserves.noReserve).toBeCloseTo(initial.k, 8);

      // Exact round-trip: sell all acquired YES shares back
      const sellRes = CpmmPricing.calculateSell('YES', buyRes.sharesOut, buyRes.newReserves, 0);
      expect(sellRes.netUsdcOut).toBeCloseTo(100.0, 9); // ZERO LEAK!
      expect(sellRes.newReserves.yesReserve).toBeCloseTo(initial.yesReserve, 8);
      expect(sellRes.newReserves.noReserve).toBeCloseTo(initial.noReserve, 8);
    });

    it('handles direct outcome swaps and liquidity provisioning correctly', () => {
      const reserves = { yesReserve: 1000, noReserve: 1000, k: 1000000 };
      const swapRes = CpmmPricing.calculateDirectSwap('YES', 100, reserves, 0);
      expect(swapRes.newReserves.yesReserve * swapRes.newReserves.noReserve).toBeCloseTo(reserves.k, 8);
      expect(swapRes.outputAmount).toBeGreaterThan(0);

      const addLiq = CpmmPricing.calculateAddLiquidity(200, 200, reserves, 1000);
      expect(addLiq.totalLpShares).toBe(1200);
      const remLiq = CpmmPricing.calculateRemoveLiquidity(200, addLiq.newReserves, addLiq.totalLpShares);
      expect(remLiq.newReserves.yesReserve).toBeCloseTo(reserves.yesReserve, 8);
    });
  });

  describe('Virtual Reserve Tracker & Multi-Token Pool', () => {
    it('enforces complete-set minting (1 USDC -> 1 of each) and merging (1 of each -> 1 USDC)', () => {
      const tracker = new VirtualReserveTracker(3, 500);
      const mintRes = tracker.mintCompleteSets(100, 0);
      expect(mintRes.setCount).toBe(100);
      expect(tracker.getCollateralReserve()).toBe(600);
      expect(tracker.getOutcomeBalances()).toEqual([100, 100, 100]);

      const mergeRes = tracker.mergeCompleteSets(50, 0);
      expect(mergeRes.setCount).toBe(50);
      expect(tracker.getCollateralReserve()).toBe(550);
      expect(tracker.getOutcomeBalances()).toEqual([50, 50, 50]);

      expect(() => tracker.mergeCompleteSets(100)).toThrow(/Insufficient balance/);
    });

    it('executes trades and updates spot prices on LMSR and CPMM pools', () => {
      const outcomes = [
        { index: 0, symbol: 'A', name: 'Outcome A', tokenId: 'tok_a' },
        { index: 1, symbol: 'B', name: 'Outcome B', tokenId: 'tok_b' },
      ];
      const lmsrPool = new MultiTokenPool({
        poolId: 'pool_lmsr',
        conditionId: 'cond_1',
        pricingModel: 'LMSR',
        outcomes,
        b: 500,
      });

      const p0Before = lmsrPool.getSpotPrices()[0];
      const tradeRes = lmsrPool.executeTrade({ poolId: 'pool_lmsr', outcomeIndex: 0, action: 'BUY', amount: 50 });
      expect(tradeRes.outputAmount).toBeGreaterThan(0);
      const p0After = lmsrPool.getSpotPrices()[0];
      expect(p0After).toBeGreaterThan(p0Before); // Buying increases spot price

      const cpmmPool = new MultiTokenPool({
        poolId: 'pool_cpmm',
        conditionId: 'cond_2',
        pricingModel: 'CPMM',
        outcomes,
        initialCpmmReserves: { yes: 1000, no: 1000 },
      });
      const cpmmTrade = cpmmPool.executeTrade({ poolId: 'pool_cpmm', outcomeIndex: 0, action: 'BUY', amount: 100 });
      expect(cpmmTrade.outputAmount).toBeGreaterThan(0);
      expect(cpmmPool.getCpmmReserves()?.k).toBeCloseTo(1000000, 6);
    });
  });

  describe('Hybrid Order Router', () => {
    it('fills cheaper CLOB limit orders first and routes residual through AMM curve', () => {
      const outcomes = [
        { index: 0, symbol: 'YES', name: 'Yes', tokenId: 'tok_yes' },
        { index: 1, symbol: 'NO', name: 'No', tokenId: 'tok_no' },
      ];
      const pool = new MultiTokenPool({
        poolId: 'pool_hybrid',
        conditionId: 'cond_3',
        pricingModel: 'CPMM',
        outcomes,
        initialCpmmReserves: { yes: 1000, no: 1000 },
      });

      // Spot price of YES is 0.50. CLOB has asks at 0.40 and 0.45 (both cheaper than 0.50)
      const orderbook = {
        marketId: 'mkt_1',
        outcomeIndex: 0,
        bids: [{ price: 0.48, size: 50 }],
        asks: [
          { price: 0.40, size: 20 },
          { price: 0.45, size: 30 },
          { price: 0.55, size: 100 }, // more expensive than AMM
        ],
        timestampMs: Date.now(),
      };

      const res = HybridOrderRouter.routeOrder(
        { orderId: 'ord_1', marketId: 'mkt_1', outcomeIndex: 0, side: 'BUY', size: 80 },
        pool,
        orderbook
      );

      expect(res.legs.length).toBe(3);
      expect(res.legs[0]).toMatchObject({ venue: 'CLOB', price: 0.40, size: 20 });
      expect(res.legs[1]).toMatchObject({ venue: 'CLOB', price: 0.45, size: 30 });
      expect(res.legs[2].venue).toBe('AMM');
      expect(res.legs[2].size).toBeGreaterThan(0);
      expect(res.vwap).toBeGreaterThan(0.40);
      expect(res.vwap).toBeLessThan(0.60);
    });
  });
});
