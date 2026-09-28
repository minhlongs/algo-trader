import { describe, it, expect } from 'vitest';
import {
  normalCdf,
  inverseNormalCdf,
  computeSkewness,
  computeKurtosis,
  expectedMaxSharpe,
  deflatedSharpeRatio,
  EULER_MASCHERONI,
} from '../stats-math';

describe('stats-math: normalCdf', () => {
  it('evaluates standard normal CDF accurately at key quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.95996)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.95996)).toBeCloseTo(0.025, 4);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 5);
    expect(normalCdf(3)).toBeCloseTo(0.99865, 4);
    expect(normalCdf(-3)).toBeCloseTo(0.00135, 4);
  });

  it('satisfies CDF symmetry and monotonicity', () => {
    for (const x of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      expect(normalCdf(-x) + normalCdf(x)).toBeCloseTo(1.0, 6);
    }
    expect(normalCdf(-2)).toBeLessThan(normalCdf(-1));
    expect(normalCdf(-1)).toBeLessThan(normalCdf(0));
    expect(normalCdf(0)).toBeLessThan(normalCdf(1));
    expect(normalCdf(1)).toBeLessThan(normalCdf(2));
  });

  it('handles boundary and non-finite values correctly', () => {
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-Infinity)).toBe(0);
    expect(Number.isNaN(normalCdf(NaN))).toBe(true);
    expect(normalCdf(10)).toBe(1);
    expect(normalCdf(-10)).toBe(0);
  });
});

describe('stats-math: inverseNormalCdf (Acklam)', () => {
  it('evaluates median and standard percentiles accurately', () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0.0, 9);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.95996398, 6);
    expect(inverseNormalCdf(0.025)).toBeCloseTo(-1.95996398, 6);
    expect(inverseNormalCdf(0.8413447)).toBeCloseTo(1.0, 5);
    expect(inverseNormalCdf(0.1586553)).toBeCloseTo(-1.0, 5);
  });

  it('evaluates extreme tails with high precision', () => {
    // p = 0.001 -> -3.0902323
    expect(inverseNormalCdf(0.001)).toBeCloseTo(-3.0902323, 5);
    expect(inverseNormalCdf(0.999)).toBeCloseTo(3.0902323, 5);

    // p = 0.0001 -> -3.719016
    expect(inverseNormalCdf(0.0001)).toBeCloseTo(-3.719016, 4);
    expect(inverseNormalCdf(0.9999)).toBeCloseTo(3.719016, 4);
  });

  it('preserves round-trip bijection with normalCdf', () => {
    const probabilities = [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.995];
    for (const p of probabilities) {
      const z = inverseNormalCdf(p);
      const reconstructed = normalCdf(z);
      expect(reconstructed).toBeCloseTo(p, 5);
    }
  });

  it('handles boundary and domain limits gracefully', () => {
    expect(inverseNormalCdf(0)).toBe(-Infinity);
    expect(inverseNormalCdf(1)).toBe(Infinity);
    expect(Number.isNaN(inverseNormalCdf(-0.1))).toBe(true);
    expect(Number.isNaN(inverseNormalCdf(1.1))).toBe(true);
    expect(Number.isNaN(inverseNormalCdf(NaN))).toBe(true);
  });
});

describe('stats-math: computeSkewness & computeKurtosis', () => {
  it('returns 0 skewness for perfectly symmetric data', () => {
    const data = [1, 2, 3, 4, 5];
    expect(computeSkewness(data)).toBeCloseTo(0, 6);
  });

  it('identifies positive and negative skewness', () => {
    const rightSkewed = [1, 1, 1, 1, 1, 10];
    const leftSkewed = [1, 10, 10, 10, 10, 10];
    expect(computeSkewness(rightSkewed)).toBeGreaterThan(1.0);
    expect(computeSkewness(leftSkewed)).toBeLessThan(-1.0);
  });

  it('returns Gaussian kurtosis of 3 for small or constant arrays', () => {
    expect(computeKurtosis([1, 2])).toBe(3);
    expect(computeKurtosis([4, 4, 4, 4])).toBe(3);
    expect(computeSkewness([4, 4, 4])).toBe(0);
  });

  it('computes heavy-tailed kurtosis (> 3) for outlier-heavy returns', () => {
    const fatTailed = [0, 0, 0, 0, 0, 0, 0, 0, 10, -10];
    expect(computeKurtosis(fatTailed)).toBeGreaterThan(4.0);
  });
});

describe('stats-math: expectedMaxSharpe', () => {
  it('returns 0 when trials <= 1 or variance <= 0', () => {
    expect(expectedMaxSharpe(1, 0.25)).toBe(0);
    expect(expectedMaxSharpe(0, 0.25)).toBe(0);
    expect(expectedMaxSharpe(-5, 0.25)).toBe(0);
    expect(expectedMaxSharpe(100, 0)).toBe(0);
    expect(expectedMaxSharpe(100, -0.1)).toBe(0);
  });

  it('uses Euler-Mascheroni constant and strictly increases with trials count', () => {
    expect(EULER_MASCHERONI).toBeCloseTo(0.5772156649, 8);
    const variance = 0.25; // std = 0.5
    const sr10 = expectedMaxSharpe(10, variance);
    const sr50 = expectedMaxSharpe(50, variance);
    const sr200 = expectedMaxSharpe(200, variance);

    expect(sr10).toBeGreaterThan(0);
    expect(sr50).toBeGreaterThan(sr10);
    expect(sr200).toBeGreaterThan(sr50);
  });
});

describe('stats-math: deflatedSharpeRatio (DSR)', () => {
  it('penalizes selection bias as number of trials grows', () => {
    const sr = 1.8;
    const srVar = 0.25;
    const skew = 0;
    const kurt = 3;
    const nObs = 60;

    const dsr1 = deflatedSharpeRatio(sr, srVar, 1, skew, kurt, nObs);
    const dsr10 = deflatedSharpeRatio(sr, srVar, 10, skew, kurt, nObs);
    const dsr100 = deflatedSharpeRatio(sr, srVar, 100, skew, kurt, nObs);

    expect(dsr1).toBeGreaterThan(0.99); // No trial selection penalty
    expect(dsr10).toBeLessThan(dsr1);
    expect(dsr100).toBeLessThan(dsr10);
  });

  it('penalizes negative return skewness (left tail risk)', () => {
    const sr = 1.5;
    const srVar = 0.2;
    const trials = 5;
    const kurt = 3;
    const nObs = 50;

    const dsrSymmetric = deflatedSharpeRatio(sr, srVar, trials, 0, kurt, nObs);
    const dsrNegSkew = deflatedSharpeRatio(sr, srVar, trials, -1.5, kurt, nObs);

    // Negative skew increases denominator and reduces z-score
    expect(dsrNegSkew).toBeLessThan(dsrSymmetric);
  });

  it('handles edge cases gracefully', () => {
    expect(deflatedSharpeRatio(1.5, 0.2, 5, 0, 3, 1)).toBe(0);
    expect(deflatedSharpeRatio(1.5, 0.2, 5, 0, 3, 0)).toBe(0);
    expect(deflatedSharpeRatio(NaN, 0.2, 5, 0, 3, 50)).toBe(0);
  });
});
