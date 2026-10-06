/**
 * Metrics Calculator — Sortino and Calmar Ratio Tests
 */
import { describe, it, expect } from 'vitest';
import {
  computeSortinoRatio,
  computeCalmarRatio,
} from '../metrics-calculator';

describe('computeSortinoRatio', () => {
  it('returns 0 for empty or single return', () => {
    expect(computeSortinoRatio([])).toBe(0);
    expect(computeSortinoRatio([0.01])).toBe(0);
  });

  it('returns 50.0 when all returns are positive (zero downside deviation)', () => {
    expect(computeSortinoRatio([0.01, 0.02, 0.03])).toBe(50.0);
  });

  it('caps at 50.0 when Sortino ratio exceeds 50', () => {
    // Large positive mean with tiny downside deviation
    const returns = [1.0, 1.0, 0.9999999, -0.0000001];
    expect(computeSortinoRatio(returns)).toBe(50.0);
  });

  it('returns 0 when downside deviation is zero and returns are zero or negative', () => {
    expect(computeSortinoRatio([0, 0])).toBe(0);
  });

  it('computes positive Sortino for mixed returns with net gain', () => {
    const returns = [0.05, -0.01, 0.04, -0.02, 0.03];
    const sortino = computeSortinoRatio(returns);
    expect(sortino).toBeGreaterThan(0);
    expect(Number.isFinite(sortino)).toBe(true);
  });

  it('supports equity curve input', () => {
    const curve = [{ equity: 100 }, { equity: 105 }, { equity: 102 }, { equity: 110 }];
    const sortino = computeSortinoRatio(curve);
    expect(sortino).toBeGreaterThan(0);
  });
});

describe('computeCalmarRatio', () => {
  it('handles zero or NaN inputs cleanly', () => {
    expect(computeCalmarRatio(NaN, 0.1)).toBe(0);
    expect(computeCalmarRatio(0.2, NaN)).toBe(0);
    expect(computeCalmarRatio(0, 0.1)).toBe(0);
  });

  it('returns 50.0 when maxDrawdown is 0 and return > 0', () => {
    expect(computeCalmarRatio(0.25, 0)).toBe(50.0);
  });

  it('caps at 50.0 when Calmar ratio exceeds 50', () => {
    expect(computeCalmarRatio(5.0, 0.01)).toBe(50.0);
  });

  it('returns 0 when maxDrawdown is 0 and return <= 0', () => {
    expect(computeCalmarRatio(0, 0)).toBe(0);
    expect(computeCalmarRatio(-0.1, 0)).toBe(0);
  });

  it('computes Calmar ratio correctly for positive and negative drawdowns', () => {
    expect(computeCalmarRatio(0.3, 0.15)).toBeCloseTo(2.0, 4);
    expect(computeCalmarRatio(0.3, -0.15)).toBeCloseTo(2.0, 4);
    expect(computeCalmarRatio(-0.15, 0.1)).toBeCloseTo(-1.5, 4);
  });
});
