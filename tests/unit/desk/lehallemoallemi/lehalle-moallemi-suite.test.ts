import { describe, it, expect } from 'vitest';
import { LehalleMoallemiEngine } from '../../../../src/desk/lehallemoallemi/lehalle-moallemi-engine';
import { LehalleMoallemiMarketParams } from '../../../../src/desk/lehallemoallemi/lehalle-moallemi-types';

describe('Desk 122: Lehalle-Moallemi (2018) Multi-Venue Lit/Dark Execution Engine', () => {
  const baseParams: LehalleMoallemiMarketParams = {
    totalOrderSize: 10000,       // Parent order of 10,000 shares
    halfSpread: 0.02,            // Half-spread $0.02
    litImpactParam: 1e-6,        // Impact coefficient eta_lit
    darkBaseFillProb: 0.60,      // 60% base dark fill probability
    darkDecayParam: 0.50,        // Fill rate decay alpha
    darkAdverseSelection: 0.005, // Dark adverse selection $0.005 / share
    darkPriceImprovement: 0.02,  // Half-spread savings $0.02 / share
    delayPenaltyFactor: 0.5e-6,  // Delayed liquidation penalty
  };

  it('allocates positive dark and lit splits achieving cost reduction vs pure lit routing', () => {
    const res = LehalleMoallemiEngine.optimize(baseParams);

    expect(res.optimalDarkSplit).toBeGreaterThan(0.0);
    expect(res.optimalLitSplit).toBeGreaterThan(0.0);
    expect(res.optimalDarkSplit + res.optimalLitSplit).toBeCloseTo(baseParams.totalOrderSize, 4);

    // Multi-venue router beats pure lit execution
    expect(res.minimumExpectedCost).toBeLessThan(res.allLitCost);
    expect(res.costSavingsBps).toBeGreaterThan(0.0);
  });

  it('shifts allocation towards lit book when dark adverse selection escalates', () => {
    const lowAdverseRes = LehalleMoallemiEngine.optimize(baseParams);
    const highAdverseRes = LehalleMoallemiEngine.optimize({
      ...baseParams,
      darkAdverseSelection: 0.035, // High adverse selection exceeds price improvement
    });

    expect(highAdverseRes.optimalDarkSplit).toBeLessThan(lowAdverseRes.optimalDarkSplit);
    expect(highAdverseRes.optimalLitSplit).toBeGreaterThan(lowAdverseRes.optimalLitSplit);
  });

  it('increases dark routing when dark base fill probability increases', () => {
    const baseRes = LehalleMoallemiEngine.optimize(baseParams);
    const highFillRes = LehalleMoallemiEngine.optimize({
      ...baseParams,
      darkBaseFillProb: 0.90, // Higher fill probability reduces non-execution penalty
    });

    expect(highFillRes.optimalDarkFraction).toBeGreaterThan(baseRes.optimalDarkFraction);
  });

  it('increases dark routing when dark price improvement is more attractive', () => {
    const baseRes = LehalleMoallemiEngine.optimize(baseParams);
    const highImprovementRes = LehalleMoallemiEngine.optimize({
      ...baseParams,
      darkPriceImprovement: 0.03, // Higher savings in dark venue
    });

    expect(highImprovementRes.optimalDarkFraction).toBeGreaterThan(baseRes.optimalDarkFraction);
  });

  it('correctly calculates fill rate and cost breakdown components', () => {
    const res = LehalleMoallemiEngine.optimize(baseParams);
    expect(res.breakdown.expectedDarkFill).toBeGreaterThan(0);
    expect(res.breakdown.expectedFillRate).toBeGreaterThan(0);
    expect(res.breakdown.expectedFillRate).toBeLessThanOrEqual(1.0);
    expect(res.breakdown.totalExpectedCost).toBeCloseTo(res.minimumExpectedCost, 6);
  });

  it('validates input parameters and rejects negative quantities', () => {
    expect(() =>
      LehalleMoallemiEngine.optimize({ ...baseParams, totalOrderSize: -500 })
    ).toThrow(/Total order size must be positive/);
    expect(() =>
      LehalleMoallemiEngine.optimize({ ...baseParams, darkBaseFillProb: 1.5 })
    ).toThrow(/Dark base fill probability must be in \(0, 1\]/);
  });
});
