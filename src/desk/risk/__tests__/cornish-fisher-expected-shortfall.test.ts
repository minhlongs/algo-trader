import { describe, it, expect } from 'vitest';
import { calculateCornishFisherVaR } from '../cornish-fisher';
import { calculateExpectedShortfall } from '../expected-shortfall';

describe('Cornish-Fisher VaR & Expected Shortfall', () => {
  it('handles small return series fallback in Cornish-Fisher', () => {
    expect(calculateCornishFisherVaR([], 10000, 0.95, 1)).toBe(0);
    expect(calculateCornishFisherVaR([0.01, -0.02, 0.01], 10000, 0.95, 1)).toBe(0);
  });

  it('handles zero variance return series', () => {
    const flat = [0.01, 0.01, 0.01, 0.01, 0.01];
    expect(calculateCornishFisherVaR(flat, 10000, 0.95, 1)).toBe(0);
  });

  it('calculates Cornish-Fisher VaR for 0.95 and 0.99 confidence levels', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.02, -0.018, 0.004, -0.03, 0.025, -0.01];
    const var95 = calculateCornishFisherVaR(returns, 100000, 0.95, 1);
    const var99 = calculateCornishFisherVaR(returns, 100000, 0.99, 1);

    expect(var95).toBeGreaterThan(0);
    expect(var99).toBeGreaterThan(0);
    expect(var99).toBeGreaterThan(var95);
  });

  it('handles empty returns in Expected Shortfall', () => {
    expect(calculateExpectedShortfall([], 10000, 0.95, 1)).toBe(0);
  });

  it('calculates Expected Shortfall accurately for fat-tailed returns', () => {
    const returns = [-0.10, -0.05, -0.02, 0.01, 0.02, 0.03, -0.08, 0.04, 0.05, -0.03];
    const es95 = calculateExpectedShortfall(returns, 50000, 0.95, 1);
    const es99 = calculateExpectedShortfall(returns, 50000, 0.99, 1);

    expect(es95).toBeGreaterThan(0);
    expect(es99).toBeGreaterThan(0);
    expect(es99).toBeGreaterThanOrEqual(es95);
  });
});
