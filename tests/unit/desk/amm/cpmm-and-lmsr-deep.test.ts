/**
 * Deep branch coverage unit tests for CpmmPricing and LmsrPricing
 */

import { describe, it, expect } from 'vitest';
import { CpmmPricing } from '../../../../src/desk/amm/pricing/cpmm-pricing';
import { LmsrPricing } from '../../../../src/desk/amm/pricing/lmsr-pricing';
import { CpmmReserves } from '../../../../src/desk/amm/types/cpmm-types';

describe('CpmmPricing Deep Branch Coverage', () => {
  const baseReserves: CpmmReserves = {
    yesReserve: 1000,
    noReserve: 1000,
    k: 1_000_000,
  };

  describe('calculateSpotPrices', () => {
    it('throws when sum of reserves <= 0', () => {
      expect(() =>
        CpmmPricing.calculateSpotPrices({ yesReserve: 0, noReserve: 0, k: 0 })
      ).toThrow('Reserves sum must be strictly positive');
      expect(() =>
        CpmmPricing.calculateSpotPrices({ yesReserve: -5, noReserve: 0, k: 0 })
      ).toThrow('Reserves sum must be strictly positive');
    });

    it('calculates spot prices correctly for valid reserves', () => {
      const prices = CpmmPricing.calculateSpotPrices({ yesReserve: 400, noReserve: 600, k: 240000 });
      expect(prices.yesPrice).toBeCloseTo(0.6, 5);
      expect(prices.noPrice).toBeCloseTo(0.4, 5);
    });
  });

  describe('calculateBuy', () => {
    it('throws when usdcIn <= 0', () => {
      expect(() => CpmmPricing.calculateBuy('YES', 0, baseReserves)).toThrow('usdcIn must be positive');
      expect(() => CpmmPricing.calculateBuy('YES', -10, baseReserves)).toThrow('usdcIn must be positive');
    });

    it('calculates buy for YES and NO outcomes with and without fee', () => {
      const buyYes = CpmmPricing.calculateBuy('YES', 100, baseReserves, 30);
      expect(buyYes.outcome).toBe('YES');
      expect(buyYes.sharesOut).toBeGreaterThan(0);
      expect(buyYes.feePaidUsdc).toBeCloseTo(0.3, 4);
      expect(buyYes.spotPriceAfter).toBeGreaterThan(buyYes.spotPriceBefore);

      const buyNo = CpmmPricing.calculateBuy('NO', 100, baseReserves, 0);
      expect(buyNo.outcome).toBe('NO');
      expect(buyNo.sharesOut).toBeGreaterThan(0);
      expect(buyNo.feePaidUsdc).toBe(0);
      expect(buyNo.spotPriceAfter).toBeGreaterThan(buyNo.spotPriceBefore);
    });
  });

  describe('calculateSell', () => {
    it('throws when sharesIn <= 0', () => {
      expect(() => CpmmPricing.calculateSell('YES', 0, baseReserves)).toThrow('sharesIn must be positive');
      expect(() => CpmmPricing.calculateSell('NO', -5, baseReserves)).toThrow('sharesIn must be positive');
    });

    it('calculates valid sell for YES and NO outcomes with fee', () => {
      const sellYes = CpmmPricing.calculateSell('YES', 50, baseReserves, 20);
      expect(sellYes.outcome).toBe('YES');
      expect(sellYes.grossUsdcOut).toBeGreaterThan(0);
      expect(sellYes.netUsdcOut).toBeLessThan(sellYes.grossUsdcOut);
      expect(sellYes.feePaidUsdc).toBeGreaterThan(0);
      expect(sellYes.spotPriceAfter).toBeLessThan(sellYes.spotPriceBefore);

      const sellNo = CpmmPricing.calculateSell('NO', 50, baseReserves, 0);
      expect(sellNo.outcome).toBe('NO');
      expect(sellNo.grossUsdcOut).toBeGreaterThan(0);
      expect(sellNo.netUsdcOut).toBe(sellNo.grossUsdcOut);
      expect(sellNo.spotPriceAfter).toBeLessThan(sellNo.spotPriceBefore);
    });

    it('throws when sell shares exceed pool liquidity causing negative discriminant', () => {
      // With corrupted/negative reserves where sum > 0: Rx = -100, Ry = 150, S = 50 -> discriminant < 0
      const invalidReserves: CpmmReserves = {
        yesReserve: -100,
        noReserve: 150,
        k: -15000,
      };
      expect(() => CpmmPricing.calculateSell('YES', 50, invalidReserves)).toThrow(
        'CPMM sell shares exceeds pool liquidity'
      );
    });
  });

  describe('calculateDirectSwap', () => {
    it('throws when inputAmount <= 0', () => {
      expect(() => CpmmPricing.calculateDirectSwap('YES', 0, baseReserves)).toThrow(
        'inputAmount must be positive'
      );
      expect(() => CpmmPricing.calculateDirectSwap('NO', -1, baseReserves)).toThrow(
        'inputAmount must be positive'
      );
    });

    it('swaps YES to NO and NO to YES with and without fee', () => {
      const swapYes = CpmmPricing.calculateDirectSwap('YES', 100, baseReserves, 10);
      expect(swapYes.inputToken).toBe('YES');
      expect(swapYes.outputToken).toBe('NO');
      expect(swapYes.outputAmount).toBeGreaterThan(0);
      expect(swapYes.feePaidShares).toBeCloseTo(0.1, 4);

      const swapNo = CpmmPricing.calculateDirectSwap('NO', 100, baseReserves, 0);
      expect(swapNo.inputToken).toBe('NO');
      expect(swapNo.outputToken).toBe('YES');
      expect(swapNo.outputAmount).toBeGreaterThan(0);
      expect(swapNo.feePaidShares).toBe(0);
    });
  });

  describe('calculateAddLiquidity', () => {
    it('throws when deltaYes or deltaNo <= 0', () => {
      expect(() => CpmmPricing.calculateAddLiquidity(0, 100, baseReserves, 1000)).toThrow(
        'Deltas must be positive'
      );
      expect(() => CpmmPricing.calculateAddLiquidity(100, 0, baseReserves, 1000)).toThrow(
        'Deltas must be positive'
      );
      expect(() => CpmmPricing.calculateAddLiquidity(-1, -1, baseReserves, 1000)).toThrow(
        'Deltas must be positive'
      );
    });

    it('initializes LP shares when totalLpShares === 0 using geometric mean', () => {
      const result = CpmmPricing.calculateAddLiquidity(400, 900, baseReserves, 0);
      expect(result.lpSharesDelta).toBe(600); // sqrt(400 * 900) = 600
      expect(result.totalLpShares).toBe(600);
    });

    it('adds liquidity proportionally when totalLpShares > 0', () => {
      // deltaYes / Rx = 100 / 1000 = 0.1, deltaNo / Ry = 200 / 1000 = 0.2 -> min is 0.1
      const res1 = CpmmPricing.calculateAddLiquidity(100, 200, baseReserves, 1000);
      expect(res1.lpSharesDelta).toBe(100);

      // deltaYes / Rx = 300 / 1000 = 0.3, deltaNo / Ry = 150 / 1000 = 0.15 -> min is 0.15
      const res2 = CpmmPricing.calculateAddLiquidity(300, 150, baseReserves, 1000);
      expect(res2.lpSharesDelta).toBe(150);
    });
  });

  describe('calculateRemoveLiquidity', () => {
    it('throws when lpSharesToBurn <= 0 or > totalLpShares', () => {
      expect(() => CpmmPricing.calculateRemoveLiquidity(0, baseReserves, 1000)).toThrow(
        'Invalid LP shares to burn'
      );
      expect(() => CpmmPricing.calculateRemoveLiquidity(-10, baseReserves, 1000)).toThrow(
        'Invalid LP shares to burn'
      );
      expect(() => CpmmPricing.calculateRemoveLiquidity(1001, baseReserves, 1000)).toThrow(
        'Invalid LP shares to burn'
      );
    });

    it('removes liquidity and burns proportional reserves', () => {
      const result = CpmmPricing.calculateRemoveLiquidity(200, baseReserves, 1000);
      expect(result.lpSharesDelta).toBe(-200);
      expect(result.totalLpShares).toBe(800);
      expect(result.deltaYes).toBe(200);
      expect(result.deltaNo).toBe(200);
      expect(result.newReserves.yesReserve).toBe(800);
      expect(result.newReserves.noReserve).toBe(800);
    });
  });
});

describe('LmsrPricing Deep Branch Coverage', () => {
  describe('calculateCost', () => {
    it('throws on non-positive b or empty liabilities', () => {
      expect(() => LmsrPricing.calculateCost([100, 100], 0)).toThrow('parameter b must be positive');
      expect(() => LmsrPricing.calculateCost([100, 100], -10)).toThrow('parameter b must be positive');
      expect(() => LmsrPricing.calculateCost([], 100)).toThrow('Liabilities vector cannot be empty');
      expect(() => LmsrPricing.calculateCost(null as any, 100)).toThrow('Liabilities vector cannot be empty');
    });

    it('handles multiple elements and correctly tracks maxScaled across iterations', () => {
      // Element 1 is larger than element 0, element 2 is smaller
      const costAscDesc = LmsrPricing.calculateCost([10, 50, 20], 100);
      expect(costAscDesc).toBeGreaterThan(0);

      // Element 0 is largest
      const costDesc = LmsrPricing.calculateCost([100, 20, 10], 100);
      expect(costDesc).toBeGreaterThan(0);
    });
  });

  describe('calculateSpotPrices', () => {
    it('throws on non-positive b or empty liabilities', () => {
      expect(() => LmsrPricing.calculateSpotPrices([100, 100], 0)).toThrow('parameter b must be positive');
      expect(() => LmsrPricing.calculateSpotPrices([], 100)).toThrow('Liabilities vector cannot be empty');
      expect(() => LmsrPricing.calculateSpotPrices(undefined as any, 100)).toThrow(
        'Liabilities vector cannot be empty'
      );
    });

    it('computes prices with maxScaled tracking across elements', () => {
      const prices = LmsrPricing.calculateSpotPrices([10, 80, 20], 100);
      expect(prices.length).toBe(3);
      const sum = prices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
      expect(prices[1]).toBeGreaterThan(prices[0]);
    });
  });

  describe('calculateTradeCost', () => {
    it('throws on non-positive b or length mismatch', () => {
      expect(() => LmsrPricing.calculateTradeCost([10, 10], [5, 5], 0)).toThrow('must be positive');
      expect(() => LmsrPricing.calculateTradeCost([10, 10], [5], 100)).toThrow(
        'Liabilities and deltaShares length mismatch'
      );
    });

    it('returns 0 when deltaShares are all zeros (nonZeroCount === 0)', () => {
      expect(LmsrPricing.calculateTradeCost([50, 50], [0, 0], 100)).toBe(0);
    });

    it('uses micro-trade single-outcome formula when nonZeroCount === 1', () => {
      const costSingle0 = LmsrPricing.calculateTradeCost([50, 50], [10, 0], 100);
      expect(costSingle0).toBeGreaterThan(0);

      const costSingle1 = LmsrPricing.calculateTradeCost([50, 50], [0, 10], 100);
      expect(costSingle1).toBeGreaterThan(0);
    });

    it('uses stabilized multi-outcome cost difference when nonZeroCount > 1', () => {
      const costMulti = LmsrPricing.calculateTradeCost([50, 50], [10, 10], 100);
      expect(costMulti).toBeGreaterThan(0);
    });
  });

  describe('calculateSharesForBudget', () => {
    it('returns 0 when budgetUsdc <= 0', () => {
      expect(LmsrPricing.calculateSharesForBudget([50, 50], 0, 0, 100)).toBe(0);
      expect(LmsrPricing.calculateSharesForBudget([50, 50], 0, -10, 100)).toBe(0);
    });

    it('throws on non-positive b or invalid outcomeIndex', () => {
      expect(() => LmsrPricing.calculateSharesForBudget([50, 50], 0, 50, 0)).toThrow('b must be positive');
      expect(() => LmsrPricing.calculateSharesForBudget([50, 50], -1, 50, 100)).toThrow('Invalid outcome index');
      expect(() => LmsrPricing.calculateSharesForBudget([50, 50], 2, 50, 100)).toThrow('Invalid outcome index');
    });

    it('calculates positive shares acquired for valid positive budget', () => {
      const shares = LmsrPricing.calculateSharesForBudget([50, 50], 0, 25, 100);
      expect(shares).toBeGreaterThan(0);
    });
  });

  describe('calculateWorstCaseLoss', () => {
    it('throws when numOutcomes <= 0 or b <= 0', () => {
      expect(() => LmsrPricing.calculateWorstCaseLoss(0, 100)).toThrow('Invalid arguments');
      expect(() => LmsrPricing.calculateWorstCaseLoss(2, 0)).toThrow('Invalid arguments');
      expect(() => LmsrPricing.calculateWorstCaseLoss(-1, -100)).toThrow('Invalid arguments');
    });

    it('calculates b * ln(n) for valid arguments', () => {
      expect(LmsrPricing.calculateWorstCaseLoss(2, 100)).toBeCloseTo(100 * Math.log(2), 5);
      expect(LmsrPricing.calculateWorstCaseLoss(4, 500)).toBeCloseTo(500 * Math.log(4), 5);
    });
  });

  describe('quoteTrade', () => {
    it('throws when outcomeIndex is out of bounds', () => {
      expect(() => LmsrPricing.quoteTrade([50, 50], -1, 10, 100)).toThrow('Invalid outcomeIndex');
      expect(() => LmsrPricing.quoteTrade([50, 50], 2, 10, 100)).toThrow('Invalid outcomeIndex');
    });

    it('quotes trade with deltaShares !== 0 and calculates fees', () => {
      const quote = LmsrPricing.quoteTrade([50, 50], 0, 20, 100, 30);
      expect(quote.outcomeIndex).toBe(0);
      expect(quote.deltaShares).toBe(20);
      expect(quote.costUsdc).toBeGreaterThan(0);
      expect(quote.feeUsdc).toBeGreaterThan(0);
      expect(quote.averagePrice).toBe(quote.costUsdc / 20);
    });

    it('quotes trade with deltaShares === 0 returning spot price as averagePrice', () => {
      const quote = LmsrPricing.quoteTrade([50, 50], 1, 0, 100);
      expect(quote.deltaShares).toBe(0);
      expect(quote.costUsdc).toBe(0);
      expect(quote.averagePrice).toBe(quote.spotPriceBefore);
    });
  });
});
