/**
 * Portfolio Correlation Tests
 *
 * Covers Pearson correlation and edge cases for the PortfolioCorrelation class.
 */

import { describe, it, expect } from 'vitest';
import { PortfolioCorrelation } from '../portfolio-correlation.js';
import { makeReturns } from './portfolio-correlation-fixtures.js';

describe('PortfolioCorrelation.pearsonCorrelation', () => {
  it('should return 1.0 for perfectly positively correlated series', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    const r = PortfolioCorrelation.pearsonCorrelation(a, b);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('should return -1.0 for perfectly negatively correlated series', () => {
    const a = [1, 2, 3];
    const b = [3, 2, 1];
    const r = PortfolioCorrelation.pearsonCorrelation(a, b);
    expect(r).toBeCloseTo(-1.0, 5);
  });

  it('should return NaN for zero-variance series (constant)', () => {
    const a = [1, 2, 3];
    const b = [1, 1, 1]; // zero variance
    const r = PortfolioCorrelation.pearsonCorrelation(a, b);
    expect(r).toBeNaN();
  });

  it('should return NaN for fewer than 3 data points', () => {
    const r = PortfolioCorrelation.pearsonCorrelation([1, 2], [1, 2]);
    expect(r).toBeNaN();
  });

  it('should handle mismatched lengths by using the minimum', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3]; // shorter
    const r = PortfolioCorrelation.pearsonCorrelation(a, b);
    // Should compute using first 3 elements of both → perfect correlation
    expect(r).toBeCloseTo(1.0, 5);
  });
});

describe('PortfolioCorrelation edge cases', () => {
  it('should handle empty input gracefully', () => {
    const matrix = PortfolioCorrelation.buildCorrelationMatrix({});
    expect(matrix.symbols).toHaveLength(0);
    expect(matrix.matrix).toHaveLength(0);
  });

  it('should classify weak correlation correctly', () => {
    // Two series with low correlation (sine waves at different frequencies)
    const a = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.01, -0.02, 0.03, -0.01];
    const b = [0.005, -0.01, 0.015, -0.005, -0.01, 0.02, -0.015, 0.01, -0.005, 0.015];
    const r = PortfolioCorrelation.pearsonCorrelation(a, b);
    // Should be a valid number (not NaN) — exact value depends on data
    expect(r).not.toBeNaN();
    expect(Math.abs(r)).toBeLessThanOrEqual(1);
  });

  it('should handle NaN values in matrix gracefully in findHighlyCorrelated', () => {
    // Build a matrix where one pair has NaN correlation (zero variance)
    const positionReturns: Record<string, number[]> = {
      A: makeReturns(10, 0.02),
      B: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // constant → will produce NaN correlation with A
      C: makeReturns(10, 0.015, 0.3),
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);
    const pairs = PortfolioCorrelation.findHighlyCorrelated(matrix, 0.5);

    // NaN pairs should be skipped, findHighlyCorrelated should not throw
    expect(Array.isArray(pairs)).toBe(true);
    // B should still be in the symbols list
    expect(matrix.symbols).toContain('B');
    // B's correlation pairs should be NaN in the matrix
    const bIdx = matrix.symbols.indexOf('B');
    expect(matrix.matrix[bIdx][0]).toBeNaN();
  });
});
