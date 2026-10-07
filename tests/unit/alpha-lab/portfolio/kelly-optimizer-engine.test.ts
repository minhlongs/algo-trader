import { describe, it, expect } from 'vitest';
import { KellyOptimizerEngine } from '../../../../src/alpha-lab/portfolio/kelly-optimizer-engine';
import type { PredictionBetCandidate } from '../../../../src/alpha-lab/portfolio/kelly-optimizer-types';

describe('KellyOptimizerEngine', () => {
  const optimizer = new KellyOptimizerEngine({
    fractionalMultiplier: 0.5, // Half-Kelly
    maxSingleBetCap: 0.20,     // 20% NAV cap
    maxTotalLeverage: 0.80,    // 80% total leverage
  });

  it('allocates positive capital when edge is favorable', () => {
    const candidates: PredictionBetCandidate[] = [
      {
        assetId: 'POLY-CANDIDATE-A',
        marketPrice: 0.40, // 40 cents
        estimatedProbability: 0.60, // 60% probability (strong edge = 20%)
      },
    ];

    const result = optimizer.optimize(candidates, 100000);
    expect(result.allocations.length).toBe(1);
    const alloc = result.allocations[0];
    expect(alloc.edge).toBeCloseTo(0.20, 4);
    expect(alloc.fullKellyFraction).toBeGreaterThan(0.30);
    // Half-Kelly capped at 20% maxSingleBetCap
    expect(alloc.allocatedFraction).toBeLessThanOrEqual(0.20);
    expect(alloc.allocatedAmountUsd).toBeLessThanOrEqual(20000);
    expect(result.totalAllocatedUsd).toBe(alloc.allocatedAmountUsd);
    expect(result.unallocatedCashUsd).toBe(100000 - alloc.allocatedAmountUsd);
  });

  it('ignores candidates with negative or zero edge', () => {
    const candidates: PredictionBetCandidate[] = [
      {
        assetId: 'OVERPRICED-ASSET',
        marketPrice: 0.70,
        estimatedProbability: 0.60, // Negative edge
      },
      {
        assetId: 'FAIR-PRICED-ASSET',
        marketPrice: 0.50,
        estimatedProbability: 0.50, // Zero edge
      },
    ];

    const result = optimizer.optimize(candidates, 50000);
    expect(result.allocations.length).toBe(0);
    expect(result.totalAllocatedFraction).toBe(0);
    expect(result.unallocatedCashUsd).toBe(50000);
  });

  it('rescales positions when sum of fractions exceeds max total leverage', () => {
    const candidates: PredictionBetCandidate[] = [
      { assetId: 'ASSET-1', marketPrice: 0.20, estimatedProbability: 0.60 },
      { assetId: 'ASSET-2', marketPrice: 0.20, estimatedProbability: 0.60 },
      { assetId: 'ASSET-3', marketPrice: 0.20, estimatedProbability: 0.60 },
      { assetId: 'ASSET-4', marketPrice: 0.20, estimatedProbability: 0.60 },
      { assetId: 'ASSET-5', marketPrice: 0.20, estimatedProbability: 0.60 },
    ];

    const result = optimizer.optimize(candidates, 100000);
    expect(result.allocations.length).toBe(5);
    expect(result.totalAllocatedFraction).toBeCloseTo(0.80, 4); // Clamped at 80% leverage
    expect(result.totalAllocatedUsd).toBeCloseTo(80000, 2);
    expect(result.unallocatedCashUsd).toBeCloseTo(20000, 2);
  });

  it('handles invalid market prices and custom cap overrides', () => {
    const defaultEngine = new KellyOptimizerEngine();
    const candidates: PredictionBetCandidate[] = [
      { assetId: 'INVALID-PRICE-LOW', marketPrice: -0.1, estimatedProbability: 0.5 },
      { assetId: 'INVALID-PRICE-HIGH', marketPrice: 1.5, estimatedProbability: 0.5 },
      {
        assetId: 'CUSTOM-CAP',
        marketPrice: 0.3,
        estimatedProbability: 0.8,
        maxFractionCap: 0.05, // Cap at 5%
      },
    ];

    const result = defaultEngine.optimize(candidates, 10000);
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].assetId).toBe('CUSTOM-CAP');
    expect(result.allocations[0].allocatedFraction).toBe(0.05);
  });
});
