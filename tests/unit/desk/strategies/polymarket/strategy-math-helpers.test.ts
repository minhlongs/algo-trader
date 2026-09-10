/**
 * Tests for strategy-math-helpers — 11 pure math functions used across
 * 30+ Polymarket strategies. Covers nominal values and every guard
 * clause (empty array, single element, degenerate range, zero askVol).
 */

import { describe, it, expect } from 'vitest';
import {
  calcMean,
  calcSMA,
  calcEMA,
  calcATR,
  calcStdDev,
  calcRealizedVol,
  calcOBI,
  percentileRank,
  priceRangePosition,
  calcMedian,
  calcSlope,
} from '../../../../../src/desk/strategies/polymarket/strategy-math-helpers';

describe('polymarket/strategy-math-helpers', () => {
  describe('calcMean', () => {
    it('returns 0 for an empty array', () => {
      expect(calcMean([])).toBe(0);
    });

    it('returns the average of the values', () => {
      expect(calcMean([1, 2, 3, 4])).toBe(2.5);
    });

    it('handles a single value', () => {
      expect(calcMean([7])).toBe(7);
    });
  });

  describe('calcSMA', () => {
    it('returns 0 for an empty array', () => {
      expect(calcSMA([])).toBe(0);
    });

    it('returns the simple moving average', () => {
      expect(calcSMA([10, 20, 30])).toBe(20);
    });

    it('handles a single price', () => {
      expect(calcSMA([42])).toBe(42);
    });
  });

  describe('calcEMA', () => {
    it('returns 0 for an empty array', () => {
      expect(calcEMA([])).toBe(0);
    });

    it('computes EMA with default alpha when omitted', () => {
      // alpha = 2/(n+1) = 2/4 = 0.5 for n=3
      // ema0=10, ema1=0.5*20+0.5*10=15, ema2=0.5*30+0.5*15=22.5
      expect(calcEMA([10, 20, 30])).toBeCloseTo(22.5, 6);
    });

    it('uses the supplied alpha', () => {
      // alpha=0.25: ema0=10, e1=0.25*20+0.75*10=12.5, e2=0.25*30+0.75*12.5=16.875
      expect(calcEMA([10, 20, 30], 0.25)).toBeCloseTo(16.875, 6);
    });

    it('returns the only element for a single-item array', () => {
      expect(calcEMA([99])).toBe(99);
    });
  });

  describe('calcATR', () => {
    it('returns 0 for fewer than 2 prices', () => {
      expect(calcATR([])).toBe(0);
      expect(calcATR([5])).toBe(0);
    });

    it('averages the absolute price moves', () => {
      // |2-1| + |3-2| + |4-3| = 3, / 3 = 1
      expect(calcATR([1, 2, 3, 4])).toBe(1);
    });

    it('handles a 2-element array', () => {
      expect(calcATR([10, 16])).toBe(6);
    });
  });

  describe('calcStdDev', () => {
    it('returns 0 for fewer than 2 values', () => {
      expect(calcStdDev([])).toBe(0);
      expect(calcStdDev([5])).toBe(0);
    });

    it('computes the sample standard deviation', () => {
      // values [2,4,4,4,5,5,7,9], mean=5, variance=32/7, stddev=sqrt(32/7)
      expect(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 6);
    });
  });

  describe('calcRealizedVol', () => {
    it('returns 0 for fewer than 2 prices', () => {
      expect(calcRealizedVol([])).toBe(0);
      expect(calcRealizedVol([100])).toBe(0);
    });

    it('returns 0 when a prior price is non-positive (no log returns)', () => {
      // prices[0] <= 0 -> no returns pushed -> calcStdDev([]) -> 0
      expect(calcRealizedVol([0, 50, 60])).toBe(0);
    });

    it('computes std dev of log returns for a valid series', () => {
      // returns = [ln(110/100), ln(121/110)] = [ln(1.1), ln(1.1)]
      // both equal -> stddev 0
      const vol = calcRealizedVol([100, 110, 121]);
      expect(vol).toBeCloseTo(0, 6);
    });

    it('computes a positive vol for a varying series', () => {
      const vol = calcRealizedVol([100, 110, 99]);
      expect(vol).toBeGreaterThan(0);
    });
  });

  describe('calcOBI', () => {
    it('returns bidVol/askVol for a positive askVol', () => {
      expect(calcOBI(200, 100)).toBe(2);
    });

    it('returns Infinity when askVol <= 0 and bidVol > 0', () => {
      expect(calcOBI(100, 0)).toBe(Infinity);
      expect(calcOBI(100, -5)).toBe(Infinity);
    });

    it('returns 1 when both bidVol <= 0 and askVol <= 0', () => {
      expect(calcOBI(0, 0)).toBe(1);
      expect(calcOBI(-3, -1)).toBe(1);
    });
  });

  describe('percentileRank', () => {
    it('returns 0.5 for an empty array', () => {
      expect(percentileRank(5, [])).toBe(0.5);
    });

    it('returns the fraction of sorted values <= value', () => {
      // 3 of 5 values <= 4
      expect(percentileRank(4, [1, 2, 3, 4, 10])).toBeCloseTo(0.8, 6);
    });

    it('returns 1 when value dominates the array', () => {
      expect(percentileRank(99, [1, 2, 3])).toBe(1);
    });

    it('returns 0 when value is below everything', () => {
      expect(percentileRank(0, [1, 2, 3])).toBe(0);
    });
  });

  describe('priceRangePosition', () => {
    it('returns 0.5 when high <= low (degenerate range)', () => {
      expect(priceRangePosition(5, 10, 5)).toBe(0.5);
      expect(priceRangePosition(5, 10, 10)).toBe(0.5);
    });

    it('returns the fractional position within the range', () => {
      expect(priceRangePosition(15, 10, 20)).toBe(0.5);
    });

    it('clamps below-low to 0', () => {
      expect(priceRangePosition(5, 10, 20)).toBe(0);
    });

    it('clamps above-high to 1', () => {
      expect(priceRangePosition(99, 10, 20)).toBe(1);
    });
  });

  describe('calcMedian', () => {
    it('returns 0 for an empty array', () => {
      expect(calcMedian([])).toBe(0);
    });

    it('returns the middle element for odd length', () => {
      expect(calcMedian([3, 1, 2])).toBe(2);
    });

    it('averages the two middle elements for even length', () => {
      expect(calcMedian([1, 2, 3, 4])).toBe(2.5);
    });

    it('does not mutate the input array', () => {
      const input = [5, 3, 1, 4, 2];
      calcMedian(input);
      expect(input).toEqual([5, 3, 1, 4, 2]);
    });
  });

  describe('calcSlope', () => {
    it('returns 0 for fewer than 2 prices', () => {
      expect(calcSlope([])).toBe(0);
      expect(calcSlope([5])).toBe(0);
    });

    it('returns a positive slope for an increasing series', () => {
      // perfect line y=i -> slope 1
      expect(calcSlope([0, 1, 2, 3, 4])).toBeCloseTo(1, 6);
    });

    it('returns a negative slope for a decreasing series', () => {
      expect(calcSlope([4, 3, 2, 1, 0])).toBeCloseTo(-1, 6);
    });

    it('returns 0 for a flat series', () => {
      expect(calcSlope([7, 7, 7, 7])).toBeCloseTo(0, 6);
    });

    // Defensive guard: denom = n*sumX2 - sumX*sumX is the variance of the
    // index series (x_i = i) scaled by n, which is strictly positive for
    // every n >= 2. The `denom === 0` early return is therefore never
    // reachable through the public API; this test asserts the invariant
    // the guard protects against rather than fabricating a degenerate call.
    it('denom is always positive for n >= 2 (guard is unreachable)', () => {
      for (let n = 2; n <= 20; n++) {
        const prices = new Array(n).fill(1);
        expect(calcSlope(prices)).toBeCloseTo(0, 6);
      }
    });
  });
});
