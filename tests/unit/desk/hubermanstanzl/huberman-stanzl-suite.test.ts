import { describe, it, expect } from 'vitest';
import { HubermanStanzlEngine } from '../../../../src/desk/hubermanstanzl/huberman-stanzl-engine';
import { HubermanStanzlParams } from '../../../../src/desk/hubermanstanzl/huberman-stanzl-types';

describe('Desk 128: Huberman-Stanzl (2004) Price Manipulation & Liquidity Engine', () => {
  const baseParams: HubermanStanzlParams = {
    permanentImpactGamma: 1e-4,
    temporaryImpactTheta: 2e-4,
    initialPrice: 100.0,
    liquidationQuantity: 10_000,
    periods: 5,
  };

  it('verifies optimal liquidation revenue and slice slippage under linear impact', () => {
    const res = HubermanStanzlEngine.evaluate(baseParams);

    expect(res.noManipulationConditionSatisfied).toBe(true);
    expect(res.optimalLiquidation.sliceSize).toBe(2_000);
    expect(res.optimalLiquidation.totalCost).toBeGreaterThan(0.0);
    expect(res.optimalLiquidation.totalRevenue).toBeLessThan(100.0 * 10_000);
    expect(res.optimalLiquidation.effectiveAveragePrice).toBeLessThan(100.0);
    expect(res.optimalLiquidation.priceSlippage).toBeGreaterThan(0.0);
  });

  it('guarantees round-trip trades have strictly positive cost (no manipulative arbitrage)', () => {
    // Buy 5,000 shares over 2 periods, sell 5,000 shares over 2 periods
    const roundTripSchedule = [2500, 2500, -2500, -2500];
    const res = HubermanStanzlEngine.evaluate({
      ...baseParams,
      testRoundTripSchedule: roundTripSchedule,
    });

    const rt = res.roundTripTest!;
    expect(rt.isRoundTrip).toBe(true);
    expect(rt.netTradedQuantity).toBe(0);
    expect(rt.expectedCost).toBeGreaterThan(0.0);
    expect(rt.expectedProfit).toBeLessThan(0.0);
    expect(rt.isManipulativeArbitrage).toBe(false);
  });

  it('detects cross-asset price manipulation on asymmetric impact matrix', () => {
    // Asymmetric cross-impact matrix violates Huberman-Stanzl Theorem 3
    const asymmetricMatrix = [
      [1e-4, 3e-4],
      [1e-4, 2e-4],
    ];

    const res = HubermanStanzlEngine.evaluate({
      ...baseParams,
      crossAssetMatrix: asymmetricMatrix,
    });

    const cross = res.crossImpactTest!;
    expect(cross.isSymmetric).toBe(false);
    expect(cross.asymmetryNorm).toBeCloseTo(2e-4);
    expect(cross.hasCrossAssetManipulation).toBe(true);
  });

  it('confirms absence of cross-asset manipulation on symmetric positive semi-definite matrix', () => {
    const symmetricMatrix = [
      [2e-4, 1e-4],
      [1e-4, 2e-4],
    ];

    const res = HubermanStanzlEngine.evaluate({
      ...baseParams,
      crossAssetMatrix: symmetricMatrix,
    });

    const cross = res.crossImpactTest!;
    expect(cross.isSymmetric).toBe(true);
    expect(cross.isPositiveSemiDefinite).toBe(true);
    expect(cross.hasCrossAssetManipulation).toBe(false);
  });

  it('validates input parameters and rejects invalid states', () => {
    expect(() =>
      HubermanStanzlEngine.evaluate({ ...baseParams, initialPrice: -10 })
    ).toThrow(/Initial price must be positive/);

    expect(() =>
      HubermanStanzlEngine.evaluate({ ...baseParams, periods: 0 })
    ).toThrow(/Periods must be an integer >= 1/);

    expect(() =>
      HubermanStanzlEngine.evaluate({ ...baseParams, permanentImpactGamma: -0.1 })
    ).toThrow(/Permanent impact gamma cannot be negative/);

    expect(() =>
      HubermanStanzlEngine.evaluate({
        ...baseParams,
        crossAssetMatrix: [[1, 2, 3], [4, 5]],
      })
    ).toThrow(/Cross-impact matrix must be square/);
  });
});
