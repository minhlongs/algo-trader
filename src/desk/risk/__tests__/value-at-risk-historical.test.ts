/**
 * Value-at-Risk (VaR) Tests — historical VaR, CVaR, and calculateVaR integration
 *
 * Covers ValueAtRiskCalculator.historicalVaR (percentile loss + sqrt(t) scaling),
 * CVaR / Expected Shortfall (historical and parametric), and three integration
 * checks against the top-level calculateVaR entry point (weights, historical,
 * parametric methods).
 */

import { describe, it, expect } from 'vitest';
import { ValueAtRiskCalculator, calculateVaR } from '../value-at-risk';
import { makeReturns, makePosition } from './value-at-risk-fixtures';

// ── Tests ─────────────────────────────────────────────────────────────────────

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
