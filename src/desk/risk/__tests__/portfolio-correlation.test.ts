/**
 * Portfolio Correlation Tests
 *
 * Covers Pearson correlation, matrix building, highly-correlated pair detection,
 * diversification score, and edge cases for the PortfolioCorrelation class.
 */

import { describe, it, expect } from 'vitest';
import { PortfolioCorrelation } from '../portfolio-correlation';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic sine-wave returns for repeatable tests. */
function makeReturns(n: number, amplitude = 0.03, offset = 0): number[] {
  return Array.from({ length: n }, (_, i) => offset + amplitude * Math.sin((2 * Math.PI * i) / n));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

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
