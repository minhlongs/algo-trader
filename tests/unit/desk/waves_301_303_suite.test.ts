import { describe, expect, it } from 'vitest';
import {
  AlmgrenChriss2000Drift,
  CarteaJaimungal2015Adverse,
  GatheralJacquier2014Svi,
} from '../../../src/desk/index';

describe('Quantitative Desk Models — Waves 301-303', () => {
  it('Wave 301: Almgren & Chriss (2000) Optimal Execution with Price Drift', () => {
    const res = AlmgrenChriss2000Drift.computeAlmgrenChriss2000Drift({
      initialInventoryQ0: 1000.0,
      liquidationHorizonT: 1.0,
      riskAversionLambda: 0.1,
      volatilitySigma: 0.2,
      temporaryImpactEta: 0.01,
      expectedPriceDriftAlpha: -0.5,
    });
    expect(res.urgencyKappa).toBeCloseTo(0.63245553, 6);
    expect(res.driftAdjustmentRate).toBeGreaterThan(0);
    expect(res.optimalInitialExecutionRate).toBeGreaterThan(res.driftNeutralInitialRate);
    expect(res.midpointRemainingInventory).toBeLessThan(500.0);
  });

  it('Wave 302: Cartea, Jaimungal & Penalva (2015) Market Making with Adverse Selection', () => {
    const res = CarteaJaimungal2015Adverse.computeCarteaJaimungal2015Adverse({
      currentInventoryQ: 4.0,
      maxInventoryCapQMax: 10.0,
      fillDecayKappa: 2.0,
      adverseSelectionCostAlpha: 0.08,
      runningInventoryPenaltyPhi: 0.05,
      volatilitySigma: 0.25,
      effectiveHorizonT: 1.0,
    });
    expect(res.baselineHalfSpread).toBeCloseTo(0.58, 6);
    expect(res.optimalBidOffset).toBeGreaterThan(res.optimalAskOffset);
    expect(res.quotedTotalSpread).toBeGreaterThan(1.16);
  });

  it('Wave 303: Gatheral & Jacquier (2014) Arbitrage-Free SVI Butterfly & Durrleman Density', () => {
    const res = GatheralJacquier2014Svi.computeGatheralJacquier2014Svi({
      logMoneynessK: 0.0,
      levelA: 0.02,
      slopeB: 0.15,
      correlationRho: -0.4,
      shiftM: 0.0,
      curvatureSigma: 0.2,
    });
    expect(res.totalImpliedVarianceW).toBeCloseTo(0.05, 6);
    expect(res.durrlemanButterflyDensityG).toBeGreaterThan(0);
    expect(res.rogerLeeWingSlopeBoundValid).toBe(true);
    expect(res.isButterflyArbitrageFree).toBe(true);
  });
});
