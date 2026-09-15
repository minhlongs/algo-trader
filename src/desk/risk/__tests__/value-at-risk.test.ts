/**
 * Value-at-Risk (VaR) Tests — parametric, edge cases, time scaling, method='both'
 *
 * Covers ValueAtRiskCalculator.parametricVaR at 95%/99% confidence, all edge cases
 * (empty positions, zero value, single position, insufficient data),
 * sqrt(t) time-horizon scaling, and the top-level method='both' variant.
 */
import { describe, it, expect } from 'vitest';
import { calculateVaR } from '../value-at-risk';
import { makeReturns, makePosition } from './value-at-risk-fixtures';

describe('ValueAtRiskCalculator', () => {
  describe('parametricVaR (95% confidence)', () => {
    it('should compute parametric VaR at 95% for a two-position portfolio', () => {
      // Position A: 60k, Position B: 40k → portfolio value = 100k
      const posA = makePosition('A', 60000, [0.01, -0.02, 0.005, -0.01, 0.015, 0.02, -0.005, 0.008]);
      const posB = makePosition('B', 40000, [0.005, -0.01, 0.015, 0.002, 0.01, -0.008, 0.012, -0.003]);
      const result = calculateVaR([posA, posB], { confidence: 0.95, horizonDays: 1, method: 'parametric' });
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
});

describe("method='both'", () => {
  it('should return both parametric and historical VaR results', () => {
    const returns = makeReturns(50, 0.02);
    const pos = makePosition('A', 100000, returns);
    const result = calculateVaR([pos], { confidence: 0.95, horizonDays: 1, method: 'both' });
    expect(result.parametricVaR).toBeDefined();
    expect(result.parametricVaR).toBeGreaterThan(0);
    expect(result.historicalVaR).toBeDefined();
    expect(result.historicalVaR).toBeGreaterThan(0);
    // CVaR should be present (historical by default when method is 'both')
    expect(result.cVaR).toBeDefined();
    expect(result.cVaR).toBeGreaterThan(0);
  });
});
