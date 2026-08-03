import { describe, it, expect } from 'vitest';
import {
  calcReturn,
  calcPearsonR,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  updateEma,
} from '../herd-behavior-math-helpers';

describe('herd-behavior-math-helpers::calcReturn', () => {
  it('returns 0 for empty array', () => {
    expect(calcReturn([])).toBe(0);
  });
  it('returns 0 for single element', () => {
    expect(calcReturn([0.5])).toBe(0);
  });
  it('returns 0 when first is 0', () => {
    expect(calcReturn([0, 0.5])).toBe(0);
  });
  it('computes simple return', () => {
    expect(calcReturn([0.5, 0.6])).toBeCloseTo(0.2, 5);
  });
  it('computes negative return', () => {
    expect(calcReturn([0.6, 0.5])).toBeCloseTo(-1 / 6, 5);
  });
  it('uses last and first only', () => {
    expect(calcReturn([0.5, 0.55, 0.7])).toBeCloseTo(0.4, 5);
  });
});

describe('herd-behavior-math-helpers::calcPearsonR', () => {
  it('returns 0 for different-length arrays', () => {
    expect(calcPearsonR([1, 2], [1])).toBe(0);
  });
  it('returns 0 for fewer than 2 elements', () => {
    expect(calcPearsonR([1], [1])).toBe(0);
  });
  it('returns 1 for perfectly positively correlated', () => {
    expect(calcPearsonR([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
  });
  it('returns -1 for perfectly negatively correlated', () => {
    expect(calcPearsonR([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 5);
  });
  it('returns 0 for zero-variance series', () => {
    expect(calcPearsonR([2, 2, 2], [1, 2, 3])).toBe(0);
  });
  it('approximates moderate positive correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 5, 4, 5];
    const r = calcPearsonR(x, y);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  expect(r).toBeCloseTo(0.7745966692414834, 4);
  });
});

describe('herd-behavior-math-helpers::calcAvgPairwiseCorrelation', () => {
  it('returns 0 for fewer than 2 series', () => {
    expect(calcAvgPairwiseCorrelation([[1, 2]])).toBe(0);
  });
  it('averages correlations across 2 series', () => {
    const s1 = [1, 2, 3];
    const s2 = [2, 4, 6];
    expect(calcAvgPairwiseCorrelation([s1, s2])).toBeCloseTo(1, 5);
  });
  it('averages across 3 perfectly correlated series', () => {
    const s = [
      [1, 2, 3],
      [2, 4, 6],
      [3, 6, 9],
    ];
    expect(calcAvgPairwiseCorrelation(s)).toBeCloseTo(1, 5);
  });
  it('returns negative when series are anti-correlated', () => {
    const s = [
      [1, 2, 3],
      [3, 2, 1],
    ];
    const r = calcAvgPairwiseCorrelation(s);
    expect(r).toBeLessThan(0);
    expect(r).toBeCloseTo(-1, 5);
  });
});

describe('herd-behavior-math-helpers::detectHerdPeak', () => {
  it('true when above threshold and declining', () => {
    expect(detectHerdPeak(0.9, 0.85, 0.8)).toBe(true);
  });
  it('false when below threshold', () => {
    expect(detectHerdPeak(0.9, 0.7, 0.8)).toBe(false);
  });
  it('false when still rising', () => {
    expect(detectHerdPeak(0.8, 0.9, 0.8)).toBe(false);
  });
  it('false at exactly threshold', () => {
    expect(detectHerdPeak(0.8, 0.8, 0.8)).toBe(false);
  });
  it('true at sharp peak', () => {
    expect(detectHerdPeak(0.99, 0.81, 0.8)).toBe(true);
  });
});

describe('herd-behavior-math-helpers::calcHerdDirection', () => {
  it('returns up for positive average', () => {
    expect(calcHerdDirection([0.1, 0.2, 0.3])).toBe('up');
  });
  it('returns down for negative average', () => {
    expect(calcHerdDirection([-0.1, -0.2, -0.3])).toBe('down');
  });
  it('returns flat for empty array', () => {
    expect(calcHerdDirection([])).toBe('flat');
  });
  it('returns flat for exactly zero average', () => {
    expect(calcHerdDirection([0.1, -0.1])).toBe('flat');
  });
  it('returns flat for all zeros', () => {
    expect(calcHerdDirection([0, 0, 0])).toBe('flat');
  });
});

describe('herd-behavior-math-helpers::updateEma', () => {
  it('returns newValue when prev is null', () => {
    expect(updateEma(null, 5, 0.2)).toBe(5);
  });
  it('returns prevEma when alpha is 0', () => {
    expect(updateEma(3, 5, 0)).toBe(3);
  });
  it('returns newValue when alpha is 1', () => {
    expect(updateEma(3, 5, 1)).toBe(5);
  });
  it('computes correct EMA step', () => {
    const result = updateEma(0.5, 0.8, 0.3);
    expect(result).toBeCloseTo(0.3 * 0.8 + 0.7 * 0.5, 5);
  });
  it('returns newValue when alpha > 1', () => {
    expect(updateEma(1, 2, 1.5)).toBe(2);
  });
});
