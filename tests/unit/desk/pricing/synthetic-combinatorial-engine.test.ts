import { describe, it, expect } from 'vitest';
import { SyntheticCombinatorialEngine } from '../../../../src/desk/pricing/synthetic-combinatorial-engine';

describe('SyntheticCombinatorialEngine', () => {
  it('validates simplex consistency on exhaustive multi-outcome contracts', () => {
    const engine = new SyntheticCombinatorialEngine(0.01);
    const outcomes = [
      { outcomeId: 'cand-A', price: 0.50 },
      { outcomeId: 'cand-B', price: 0.30 },
      { outcomeId: 'cand-C', price: 0.20 },
    ];

    const result = engine.validateSimplex('market-election', outcomes);
    expect(result.isConsistent).toBe(true);
    expect(result.sumProbabilities).toBe(1.0);
    expect(result.arbitrageDiscrepancy).toBe(0);
  });

  it('detects Dutch-book arbitrage opportunity on mispriced simplex', () => {
    const engine = new SyntheticCombinatorialEngine(0.01);
    // Overpriced partition summing to 1.12
    const outcomes = [
      { outcomeId: 'cand-A', price: 0.60 },
      { outcomeId: 'cand-B', price: 0.35 },
      { outcomeId: 'cand-C', price: 0.17 },
    ];

    const result = engine.validateSimplex('market-overpriced', outcomes);
    expect(result.isConsistent).toBe(false);
    expect(result.arbitrageDiscrepancy).toBeCloseTo(0.12);
  });

  it('verifies Fréchet bounds on joint probability events', () => {
    const engine = new SyntheticCombinatorialEngine();
    // p(A) = 0.6, p(B) = 0.7. Fréchet bounds: [0.3, 0.6]
    const validCase = engine.validateFrechetBounds(0.6, 0.7, 0.5);
    expect(validCase.isWithinBounds).toBe(true);
    expect(validCase.lowerBound).toBe(0.3);
    expect(validCase.upperBound).toBe(0.6);

    // Violation: joint probability = 0.7 exceeds upper bound 0.6
    const invalidCase = engine.validateFrechetBounds(0.6, 0.7, 0.7);
    expect(invalidCase.isWithinBounds).toBe(false);
    expect(invalidCase.violationDiscrepancy).toBeCloseTo(0.1);
  });
});
