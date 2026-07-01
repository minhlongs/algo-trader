/**
 * Value-at-Risk (VaR) and Conditional VaR Tests
 *
 * Covers parametric, historical, CVaR, edge cases, time horizon scaling, and
 * method='both' for the ValueAtRiskCalculator and calculateVaR entry point.
 */

import { describe, it, expect } from 'vitest';
import {
  ValueAtRiskCalculator,
  calculateVaR,
  PositionPnlInput,
  VaRConfig,
} from '../value-at-risk';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate synthetic daily returns from a simple sine wave for deterministic testing. */
function makeReturns(n: number, amplitude = 0.03, offset = 0): number[] {
  return Array.from({ length: n }, (_, i) => offset + amplitude * Math.sin((2 * Math.PI * i) / n));
}

function makePosition(
  symbol: string,
  currentValue: number,
  returns: number[],
): PositionPnlInput {
  return { symbol, currentValue, returns };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ValueAtRiskCalculator', () => {
  describe('parametricVaR (95% confidence)', () => {
    it('should compute parametric VaR at 95% for a two-position portfolio', () => {
      // Position A: 60k, Position B: 40k → portfolio value = 100k
      const posA = makePosition('A', 60000, [0.01, -0.02, 0.005, -0.01, 0.015, 0.02, -0.005, 0.008]);
      const posB = makePosition('B', 40000, [0.005, -0.01, 0.015, 0.002, 0.01, -0.008, 0.012, -0.003]);

      const result = calculateVaR([posA, posB], {
        confidence: 0.95,
        horizonDays: 1,
        method: 'parametric',
      });

      expect(result.parametricVaR).toBeDefined();
      expect(result.parametricVaR).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.95);
      expect(result.totalPortfolioValue).toBe(100000);

      // Verify manually: compute weighted portfolio returns, then sigma
      const weights = [0.6, 0.4];
      const n = Math.min(posA.returns.length, posB.returns.length);
      const portRets: number[] = [];
      for (let t = 0; t < n; t++) {
        portRets.push(weights[0] * posA.returns[t] + weights[1] * posB.returns[t]);
      }
      const mean = portRets.reduce((s, v) => s + v, 0) / n;
      const variance = portRets.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
      const sigma = Math.sqrt(variance);
      const expectedVaR = 100000 * 1.645 * sigma * 1;

      expect(result.parametricVaR).toBeCloseTo(expectedVaR, 0);
    });
  });

  describe('parametricVaR (99% confidence)', () => {
    it('should be higher than 95% VaR (z=2.326 > z=1.645)', () => {
      // Same returns for both positions to keep it deterministic
      const returns = makeReturns(50, 0.02);
      const pos = makePosition('A', 100000, returns);

      const var95 = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
      const var99 = calculateVaR([pos], { confidence: 0.99, horizonDays: 1, method: 'parametric' });

      expect(var99.parametricVaR).toBeGreaterThan(var95.parametricVaR!);
      // Ratio should be approximately 2.326 / 1.645 ≈ 1.414
      const ratio = var99.parametricVaR! / var95.parametricVaR!;
      expect(ratio).toBeCloseTo(2.326 / 1.645, 1);
    });
  });

  describe('historicalVaR', () => {
    it('should produce ~5th percentile loss at 95% with 100 samples', () => {
      // Generate 100 returns with known distribution
      const returns: number[] = [];
      for (let i = 0; i < 100; i++) {
        // Deterministic: descending from +0.05 to -0.05 in equal steps
        returns.push(0.05 - (0.1 * i) / 99);
      }

      const pv = 100000;
      const var_ = ValueAtRiskCalculator.historicalVaR(returns, pv, 0.95, 1);

      // Sorted returns: the 5th percentile is approximately the 5th smallest
      // With 100 samples at 95%, idx = floor(0.05 * 100) = 5 → sorted[5]
      const sorted = [...returns].sort((a, b) => a - b);
      const expectedPercentile = Math.abs(sorted[5]);
      const expectedVaR = expectedPercentile * pv;

      expect(var_).toBeCloseTo(expectedVaR, 0);
      expect(var_).toBeGreaterThan(0);
    });

    it('should scale with sqrt(horizon)', () => {
      const returns = makeReturns(100, 0.02);
      const pv = 100000;

      const var1d = ValueAtRiskCalculator.historicalVaR(returns, pv, 0.95, 1);
      const var10d = ValueAtRiskCalculator.historicalVaR(returns, pv, 0.95, 10);

      // 10-day VaR ≈ sqrt(10) × 1-day VaR
      const ratio = var10d / var1d;
      expect(ratio).toBeCloseTo(Math.sqrt(10), 0);
    });
  });

  describe('CVaR (Expected Shortfall)', () => {
    it('should be larger than VaR (tail average beyond threshold)', () => {
      // Use 50 returns so the 95% tail has 3 elements (floor(0.05*50)+1 = 3)
      // This ensures CVaR (average of worst 3) differs from VaR (single worst percentile)
      const returns: number[] = [];
      // Generate mostly positive returns with 3 negative outliers at the tail
      for (let i = 0; i < 47; i++) returns.push(0.01 + (i % 5) * 0.005);
      returns.push(-0.08, -0.04, -0.02); // 3 clear negative outliers
      const pv = 100000;

      const var_ = ValueAtRiskCalculator.historicalVaR(returns, pv, 0.95, 1);
      const cvar = ValueAtRiskCalculator.cVaRHistorical(returns, pv, 0.95, 1);

      expect(cvar).toBeGreaterThan(var_);
    });

    it('parametric CVaR should be larger than parametric VaR', () => {
      const returns = makeReturns(60, 0.025);
      const pv = 100000;
      const confidence = 0.95;
      const horizon = 1;

      const var_ = ValueAtRiskCalculator.parametricVaR(returns, pv, confidence, horizon);
      const cvar = ValueAtRiskCalculator.cVaRParametric(returns, pv, confidence, horizon);

      expect(cvar).toBeGreaterThan(var_);
    });
  });

  describe('edge cases', () => {
    it('should return zero VaR for empty positions', () => {
      const result = calculateVaR([], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
      expect(result.parametricVaR).toBe(0);
      expect(result.totalPortfolioValue).toBe(0);
    });

    it('should return zero VaR for zero portfolio value', () => {
      const pos = makePosition('A', 0, [0.01, -0.02]);
      const result = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
      expect(result.parametricVaR).toBe(0);
    });

    it('should work with a single position', () => {
      const returns = makeReturns(30, 0.02);
      const pos = makePosition('SOLO', 50000, returns);
      const result = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'parametric' });

      expect(result.parametricVaR).toBeGreaterThan(0);
      expect(result.totalPortfolioValue).toBe(50000);
    });

    it('should return zero for insufficient return data (< 2 periods)', () => {
      const pos = makePosition('A', 10000, [0.01]); // only 1 return
      const result = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
      expect(result.parametricVaR).toBe(0);
    });
  });

  describe('time horizon scaling', () => {
    it('should scale 10-day VaR ≈ sqrt(10) × 1-day VaR (parametric)', () => {
      const returns = makeReturns(200, 0.015, 0.001);
      const pos = makePosition('A', 100000, returns);

      const var1d = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
      const var10d = calculateVaR([pos], { confidence: 0.95, horizonDays: 10, method: 'parametric' });

      const ratio = var10d.parametricVaR! / var1d.parametricVaR!;
      expect(ratio).toBeCloseTo(Math.sqrt(10), 0);
    });
  });

  describe("method='both'", () => {
    it('should return both parametric and historical VaR results', () => {
      const returns = makeReturns(50, 0.02);
      const pos = makePosition('A', 100000, returns);

      const result = calculateVaR([pos], {
        confidence: 0.95,
        horizonDays: 1,
        method: 'both',
      });

      expect(result.parametricVaR).toBeDefined();
      expect(result.parametricVaR).toBeGreaterThan(0);
      expect(result.historicalVaR).toBeDefined();
      expect(result.historicalVaR).toBeGreaterThan(0);
      // CVaR should be present (historical by default when method is 'both')
      expect(result.cVaR).toBeDefined();
      expect(result.cVaR).toBeGreaterThan(0);
    });
  });
});

describe('calculateVaR integration', () => {
  it('should derive weights from currentValue proportion', () => {
    const posA = makePosition('A', 70000, makeReturns(20, 0.02));
    const posB = makePosition('B', 30000, makeReturns(20, 0.01, 0.005));

    const result = calculateVaR([posA, posB], {
      confidence: 0.95,
      horizonDays: 1,
      method: 'parametric',
    });

    expect(result.totalPortfolioValue).toBe(100000);
    expect(result.parametricVaR).toBeGreaterThan(0);
  });

  it('should use CVaRHistorical when method is historical', () => {
    const returns = makeReturns(40, 0.02);
    const pos = makePosition('A', 50000, returns);

    const result = calculateVaR([pos], {
      confidence: 0.95,
      horizonDays: 1,
      method: 'historical',
    });

    expect(result.historicalVaR).toBeGreaterThan(0);
    expect(result.cVaR).toBeGreaterThan(0);
  });

  it('should use CVaRParametric when method is parametric', () => {
    const returns = makeReturns(40, 0.02);
    const pos = makePosition('A', 50000, returns);

    const result = calculateVaR([pos], {
      confidence: 0.95,
      horizonDays: 1,
      method: 'parametric',
    });

    expect(result.parametricVaR).toBeGreaterThan(0);
    expect(result.cVaR).toBeGreaterThan(0);
  });
});
