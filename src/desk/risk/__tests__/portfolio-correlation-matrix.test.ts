/**
 * Portfolio Correlation Matrix & Highly-Correlated Tests
 */

import { describe, it, expect } from 'vitest';
import { PortfolioCorrelation } from '../portfolio-correlation.js';
import { makeReturns } from './portfolio-correlation-fixtures.js';

describe('PortfolioCorrelation.buildCorrelationMatrix', () => {
  it('should build a 3×3 matrix for 3 symbols with sufficient data', () => {
    const positionReturns: Record<string, number[]> = {
      BTC: makeReturns(30, 0.02),
      ETH: makeReturns(30, 0.025, 0.005),
      SOL: makeReturns(30, 0.015, -0.003),
    };

    const result = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);

    expect(result.symbols).toHaveLength(3);
    expect(result.matrix).toHaveLength(3);
    expect(result.matrix[0]).toHaveLength(3);
    // Diagonal should be 1
    expect(result.matrix[0][0]).toBe(1);
    expect(result.matrix[1][1]).toBe(1);
    expect(result.matrix[2][2]).toBe(1);
    // Matrix should be symmetric
    expect(result.matrix[0][1]).toBe(result.matrix[1][0]);
    expect(result.matrix[0][2]).toBe(result.matrix[2][0]);
    expect(result.matrix[1][2]).toBe(result.matrix[2][1]);
  });

  it('should filter out symbols with fewer than 5 data points', () => {
    const positionReturns: Record<string, number[]> = {
      GOOD: makeReturns(30, 0.02),
      BAD: [0.01, 0.02], // only 2 data points → filtered
      OK: makeReturns(10, 0.01),
    };

    const result = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);

    expect(result.symbols).toHaveLength(2);
    expect(result.symbols).toContain('GOOD');
    expect(result.symbols).toContain('OK');
    expect(result.symbols).not.toContain('BAD');
  });

  it('should return empty matrix when fewer than 2 symbols qualify', () => {
    const positionReturns: Record<string, number[]> = {
      ONLY_ONE: makeReturns(20, 0.02),
    };

    const result = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);

    expect(result.symbols).toHaveLength(1);
    expect(result.matrix).toHaveLength(0);
  });
});

describe('PortfolioCorrelation.findHighlyCorrelated', () => {
  it('should detect pair with correlation >= 0.7 and skip pair below threshold', () => {
    // Create known correlations using deterministic data
    const positionReturns: Record<string, number[]> = {
      // AAPL and MSFT: almost identical returns → high correlation
      AAPL: [0.01, 0.02, 0.015, 0.022, 0.018, 0.03, 0.025, 0.02, 0.028, 0.019],
      MSFT: [0.012, 0.019, 0.016, 0.021, 0.019, 0.029, 0.026, 0.021, 0.027, 0.018],
      // GLD: uncorrelated (different direction pattern)
      GLD: [-0.005, -0.003, -0.008, -0.001, 0.002, -0.004, -0.007, -0.002, 0.001, -0.006],
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);

    // Find pairs with default threshold (0.7)
    const pairs = PortfolioCorrelation.findHighlyCorrelated(matrix, 0.7);

    // AAPL-MSFT should be highly correlated (> 0.9 expected)
    const aaplMsft = pairs.find(
      (p) => (p.symbolA === 'AAPL' && p.symbolB === 'MSFT') ||
             (p.symbolA === 'MSFT' && p.symbolB === 'AAPL'),
    );
    expect(aaplMsft).toBeDefined();
    expect(aaplMsft!.correlation).toBeGreaterThanOrEqual(0.7);
    expect(aaplMsft!.strength).toBe('strong_positive');

    // GLD pairs should NOT appear (low correlation)
    const hasGld = pairs.some((p) => p.symbolA === 'GLD' || p.symbolB === 'GLD');
    expect(hasGld).toBe(false);
  });

  it('should sort results by absolute correlation descending', () => {
    const positionReturns: Record<string, number[]> = {
      X: [0.01, 0.02, 0.015, 0.022, 0.018, 0.03, 0.025],
      Y: [0.011, 0.019, 0.014, 0.023, 0.017, 0.031, 0.024], // ~0.99 with X
      Z: [-0.01, -0.02, -0.015, -0.022, -0.018, -0.03, -0.025], // ~-1.0 with X
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);
    const pairs = PortfolioCorrelation.findHighlyCorrelated(matrix, 0.5);

    expect(pairs.length).toBeGreaterThanOrEqual(2);
    // First pair should have highest absolute correlation
    const abs0 = Math.abs(pairs[0].correlation);
    const abs1 = Math.abs(pairs[1].correlation);
    expect(abs0).toBeGreaterThanOrEqual(abs1);
  });

  it('should return empty array when no pairs exceed threshold', () => {
    // Truly independent random-like series with very low pairwise correlation
    const positionReturns: Record<string, number[]> = {
      // Two series with near-zero correlation: one trending up, one mean-reverting
      UP: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10,
           0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20],
      OSC: [0.01, -0.01, 0.02, -0.02, 0.03, -0.03, 0.04, -0.04, 0.05, -0.05,
            0.06, -0.06, 0.07, -0.07, 0.08, -0.08, 0.09, -0.09, 0.10, -0.10],
    };

    const matrix = PortfolioCorrelation.buildCorrelationMatrix(positionReturns);
    const pairs = PortfolioCorrelation.findHighlyCorrelated(matrix, 0.99); // very high threshold

    expect(pairs).toHaveLength(0);
  });
});
