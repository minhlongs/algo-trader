/**
 * Strategy Math Helpers Tests
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
} from '../strategy-math-helpers';

describe('calcMean', () => {
  it('returns 0 for empty array', () => expect(calcMean([])).toBe(0));
  it('returns the value for single element', () => expect(calcMean([5])).toBe(5));
  it('calculates arithmetic mean', () => expect(calcMean([1, 2, 3, 4])).toBe(2.5));
});

describe('calcSMA', () => {
  it('returns 0 for empty array', () => expect(calcSMA([])).toBe(0));
  it('is same as mean for series', () => expect(calcSMA([10, 20, 30])).toBe(20));
});

describe('calcEMA', () => {
  it('returns 0 for empty array', () => expect(calcEMA([])).toBe(0));
  it('uses default alpha based on length', () => {
    const result = calcEMA([10, 20, 30]);
    expect(result).toBeGreaterThan(0);
  });
  it('uses custom alpha when provided', () => {
    const result = calcEMA([10, 20, 30], 0.5);
    // ema = 0.5*20 + 0.5*10 = 15; then 0.5*30 + 0.5*15 = 22.5
    expect(result).toBe(22.5);
  });
  it('handles alpha of 1.0 (follows last value)', () => {
    expect(calcEMA([10, 20, 30], 1.0)).toBe(30);
  });
  it('handles alpha of 0 (return first value)', () => {
    expect(calcEMA([10, 20, 30], 0)).toBe(10);
  });
});

describe('calcATR', () => {
  it('returns 0 for fewer than 2 prices', () => {
    expect(calcATR([])).toBe(0);
    expect(calcATR([10])).toBe(0);
  });
  it('calculates average true range', () => {
    // |20-10| + |15-20| + |25-15| = 10 + 5 + 10 = 25 / 3 = 8.33...
    expect(calcATR([10, 20, 15, 25])).toBeCloseTo(8.333, 2);
  });
  it('handles equal prices', () => {
    expect(calcATR([10, 10, 10])).toBe(0);
  });
});

describe('calcStdDev', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(calcStdDev([])).toBe(0);
    expect(calcStdDev([5])).toBe(0);
  });
  it('returns 0 for identical values', () => expect(calcStdDev([5, 5, 5])).toBe(0));
  it('calculates sample standard deviation', () => {
    const result = calcStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    // mean = 5
    // variance = (9+1+1+1+0+0+4+16)/7 = 32/7 ≈ 4.571
    expect(result).toBeCloseTo(2.138, 2);
  });
});

describe('calcRealizedVol', () => {
  it('returns 0 for fewer than 2 prices', () => {
    expect(calcRealizedVol([])).toBe(0);
    expect(calcRealizedVol([100])).toBe(0);
  });
  it('returns 0 for constant prices', () => {
    expect(calcRealizedVol([100, 100, 100])).toBe(0);
  });
  it('calculates realized volatility', () => {
    const result = calcRealizedVol([100, 102, 98, 105]);
    expect(result).toBeGreaterThan(0);
  });
  it('handles zero in denominator gracefully', () => {
    // price goes from 0 to something — log(0) issue avoided by guard
    const result = calcRealizedVol([0, 100]);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('calcOBI', () => {
  it('returns Infinity when askVol is 0 and bidVol > 0', () => {
    expect(calcOBI(100, 0)).toBe(Infinity);
  });
  it('returns 1 when both volumes are 0', () => expect(calcOBI(0, 0)).toBe(1));
  it('returns 1 when both volumes are 0 and bid is 0', () => expect(calcOBI(0, 0)).toBe(1));
  it('calculates ratio for normal values', () => {
    expect(calcOBI(200, 100)).toBe(2);
    expect(calcOBI(50, 100)).toBe(0.5);
  });
});

describe('percentileRank', () => {
  it('returns 0.5 for empty array', () => expect(percentileRank(5, [])).toBe(0.5));
  it('returns 1.0 when value is greater than all', () => {
    expect(percentileRank(10, [1, 2, 3])).toBe(1);
  });
  it('returns 0 when value is less than all', () => {
    expect(percentileRank(0, [1, 2, 3])).toBe(0);
  });
  it('calculates percentile correctly', () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBe(0.6);
  });
  it('handles equal values', () => {
    expect(percentileRank(3, [3, 3, 3])).toBe(1);
  });
});

describe('priceRangePosition', () => {
  it('returns 0.5 when high <= low', () => {
    expect(priceRangePosition(10, 20, 10)).toBe(0.5);
    expect(priceRangePosition(10, 10, 10)).toBe(0.5);
  });
  it('returns 0 at low bound', () => {
    expect(priceRangePosition(10, 10, 20)).toBe(0);
  });
  it('returns 1 at high bound', () => {
    expect(priceRangePosition(20, 10, 20)).toBe(1);
  });
  it('returns 0.5 at midpoint', () => {
    expect(priceRangePosition(15, 10, 20)).toBe(0.5);
  });
  it('clamps values below low to 0', () => {
    expect(priceRangePosition(5, 10, 20)).toBe(0);
  });
  it('clamps values above high to 1', () => {
    expect(priceRangePosition(25, 10, 20)).toBe(1);
  });
});

describe('calcMedian', () => {
  it('returns 0 for empty array', () => expect(calcMedian([])).toBe(0));
  it('returns the value for single element', () => expect(calcMedian([42])).toBe(42));
  it('returns middle value for odd-length array', () => {
    expect(calcMedian([3, 1, 2])).toBe(2);
  });
  it('returns average of two middle values for even-length', () => {
    expect(calcMedian([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('calcSlope', () => {
  it('returns 0 for fewer than 2 points', () => {
    expect(calcSlope([])).toBe(0);
    expect(calcSlope([5])).toBe(0);
  });
  it('returns positive slope for uptrend', () => {
    expect(calcSlope([10, 20, 30])).toBeGreaterThan(0);
  });
  it('returns negative slope for downtrend', () => {
    expect(calcSlope([30, 20, 10])).toBeLessThan(0);
  });
  it('returns 0 for flat prices', () => {
    expect(calcSlope([10, 10, 10])).toBeCloseTo(0);
  });
  it('handles denominator of zero (all x same — not possible with indices)', () => {
    // n * sumX2 - sumX*sumX with n=1 goes to 0, but we handle n<2
    expect(calcSlope([5])).toBe(0);
  });
});
