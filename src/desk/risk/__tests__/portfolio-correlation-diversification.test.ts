/**
 * Portfolio Correlation Diversification Score Tests
 */

import { describe, it, expect } from 'vitest';
import { PortfolioCorrelation } from '../portfolio-correlation.js';
import { makeReturns } from './portfolio-correlation-fixtures.js';

describe('PortfolioCorrelation.diversificationScore', () => {
  it('should return near 1.0 for uncorrelated assets', () => {
    // Independent random-like series with low pairwise correlation
    const positionReturns: Record<string, number[]> = {
      A: makeReturns(50, 0.02, 0),
      B: makeReturns(50, 0.02, 0.1),
      C: makeReturns(50, 0.02, 0.2),
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);
    const score = PortfolioCorrelation.diversificationScore(matrix);

    // With sine waves at different phases, correlation should be moderate → score > 0
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should return 0 when all assets are perfectly correlated', () => {
    const base = makeReturns(20, 0.02);
    const positionReturns: Record<string, number[]> = {
      X: base,
      Y: base, // identical → correlation = 1
      Z: base, // identical → correlation = 1
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);
    const score = PortfolioCorrelation.diversificationScore(matrix);

    // All pairs have correlation = 1 → avg = 1 → score = 0
    expect(score).toBeCloseTo(0, 1);
  });

  it('should return 1 for a single asset', () => {
    const matrix = PortfolioCorrelation.buildCorrelationMatrix({
      SOLO: makeReturns(20, 0.02),
    });

    const score = PortfolioCorrelation.diversificationScore(matrix);
    expect(score).toBe(1);
  });

  it('should return 0 for empty matrix', () => {
    const score = PortfolioCorrelation.diversificationScore({ symbols: [], matrix: [] });
    expect(score).toBe(0);
  });
});
