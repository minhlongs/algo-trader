/**
 * Herd Behavior Math Helpers Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calcReturn,
  calcPearsonR,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  updateEma,
} from '../herd-behavior-math-helpers';

describe('calcReturn', () => {
  it('returns 0 for fewer than 2 prices', () => {
    expect(calcReturn([])).toBe(0);
    expect(calcReturn([100])).toBe(0);
  });
  it('returns 0 when first price is 0', () => {
    expect(calcReturn([0, 100])).toBe(0);
  });
  it('calculates positive return', () => {
    expect(calcReturn([100, 110])).toBeCloseTo(0.10);
  });
  it('calculates negative return', () => {
    expect(calcReturn([100, 90])).toBeCloseTo(-0.10);
  });
  it('returns 0 for no change', () => {
    expect(calcReturn([100, 100])).toBe(0);
  });
});

describe('calcPearsonR', () => {
  it('returns 0 for mismatched lengths', () => {
    expect(calcPearsonR([1, 2], [1, 2, 3])).toBe(0);
  });
  it('returns 0 for fewer than 2 points', () => {
    expect(calcPearsonR([1], [2])).toBe(0);
  });
  it('returns 1 for perfectly correlated data', () => {
    const r = calcPearsonR([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBeCloseTo(1, 10);
  });
  it('returns -1 for perfectly anti-correlated data', () => {
    const r = calcPearsonR([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1, 10);
  });
  it('returns 0 for uncorrelated data (zero variance in one series)', () => {
    const r = calcPearsonR([1, 1, 1], [2, 3, 4]);
    expect(r).toBe(0);
  });
  it('handles zero variance in y', () => {
    expect(calcPearsonR([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe('calcAvgPairwiseCorrelation', () => {
  it('returns 0 for fewer than 2 series', () => {
    expect(calcAvgPairwiseCorrelation([[1, 2]])).toBe(0);
  });
  it('computes average across all pairs', () => {
    // Series all perfectly correlated with each other
    const series = [
      [1, 2, 3],
      [2, 4, 6],
      [3, 6, 9],
    ];
    const avg = calcAvgPairwiseCorrelation(series);
    expect(avg).toBeCloseTo(1, 5);
  });
  it('handles some zero-variance series', () => {
    const series = [
      [1, 2, 3],
      [5, 5, 5], // zero variance -> correlation = 0
    ];
    const avg = calcAvgPairwiseCorrelation(series);
    expect(avg).toBe(0);
  });
});

describe('detectHerdPeak', () => {
  it('returns true when herding peaked', () => {
    expect(detectHerdPeak(0.9, 0.8, 0.7)).toBe(true);
  });
  it('returns false when current still increasing', () => {
    expect(detectHerdPeak(0.7, 0.8, 0.7)).toBe(false);
  });
  it('returns false when below threshold', () => {
    expect(detectHerdPeak(0.6, 0.5, 0.7)).toBe(false);
  });
  it('returns false when current equals prev', () => {
    expect(detectHerdPeak(0.8, 0.8, 0.7)).toBe(false);
  });
  it('returns false when current equals threshold but not declining', () => {
    expect(detectHerdPeak(0.6, 0.7, 0.7)).toBe(false);
  });
});

describe('calcHerdDirection', () => {
  it('returns flat for empty array', () => expect(calcHerdDirection([])).toBe('flat'));
  it('returns up for positive average', () => {
    expect(calcHerdDirection([0.01, 0.02, 0.03])).toBe('up');
  });
  it('returns down for negative average', () => {
    expect(calcHerdDirection([-0.01, -0.02, -0.03])).toBe('down');
  });
  it('returns flat for zero average', () => {
    expect(calcHerdDirection([0, 0, 0])).toBe('flat');
  });
  it('returns flat when positive and negative cancel', () => {
    expect(calcHerdDirection([0.05, -0.05])).toBe('flat');
  });
});

describe('updateEma', () => {
  it('returns newValue when prevEma is null', () => {
    expect(updateEma(null, 42, 0.3)).toBe(42);
  });
  it('returns prevEma when alpha <= 0', () => {
    expect(updateEma(10, 20, 0)).toBe(10);
    expect(updateEma(10, 20, -0.5)).toBe(10);
  });
  it('returns newValue when alpha >= 1', () => {
    expect(updateEma(10, 20, 1)).toBe(20);
    expect(updateEma(10, 20, 2)).toBe(20);
  });
  it('computes EMA correctly', () => {
    const result = updateEma(10, 20, 0.2);
    expect(result).toBeCloseTo(12); // 0.2 * 20 + 0.8 * 10
  });
  it('handles zero newValue', () => {
    const result = updateEma(50, 0, 0.1);
    expect(result).toBeCloseTo(45); // 0.1 * 0 + 0.9 * 50
  });
});
