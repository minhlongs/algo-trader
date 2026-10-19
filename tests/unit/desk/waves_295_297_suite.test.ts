import { describe, expect, it } from 'vitest';
import {
  Bouchaud2004Propagator,
  CarteaJaimungal2016FxTriplet,
  GatheralSchied2013Dynamical,
} from '../../../src/desk/index';

describe('Quantitative Desk Models — Waves 295-297', () => {
  it('Wave 295: Gatheral & Schied (2013) Dynamical Models of Market Impact', () => {
    const res = GatheralSchied2013Dynamical.computeGatheralSchied2013Dynamical({
      tradeRateSchedule: [120, 80, 60, 80, 120],
      stepDurationDt: 0.2,
      transientImpactEta: 0.05,
      resilienceDecayRho: 1.8,
      permanentImpactGamma: 0.01,
    });
    expect(res.terminalTransientState).toBeGreaterThan(0);
    expect(res.expectedTransientCost).toBeGreaterThan(0);
    expect(res.expectedPermanentCost).toBeCloseTo(0.5 * 0.01 * 92 * 92, 6);
    expect(res.noPriceManipulationVerified).toBe(true);
  });

  it('Wave 296: Cartea, Jaimungal & Kinzebulatov (2016) FX Triplet Cross-Rate Arbitrage', () => {
    const res = CarteaJaimungal2016FxTriplet.computeCarteaJaimungal2016FxTriplet({
      spotRateXY: 1.1,
      spotRateYZ: 150.0,
      spotRateXZ: 164.5,
      meanReversionKappa: 8.0,
      temporaryImpactEta: 0.02,
      inventoryPenaltyPhi: 0.01,
      netTripletInventoryQ: 2.0,
    });
    expect(res.syntheticCrossRateXZ).toBeCloseTo(165.0, 6);
    expect(res.logTriangularMispricingBps).toBeGreaterThan(25);
    expect(res.alphaSignalVelocity).toBeGreaterThan(0);
    expect(res.inventoryDampingVelocity).toBeLessThan(0);
  });

  it('Wave 297: Bouchaud et al. (2004) Long-Memory Propagator & Diffusive Variance', () => {
    const res = Bouchaud2004Propagator.computeBouchaud2004Propagator({
      signAutocorrelationGamma: 0.5,
      bareImpactScaleG0: 0.08,
      evaluationLagSteps: 16,
      unconditionalSignVariance: 1.0,
    });
    expect(res.criticalPropagatorBeta).toBeCloseTo(0.25, 8);
    expect(res.propagatorKernelAtLag).toBeCloseTo(0.04, 8);
    expect(res.signCorrelationAtLag).toBeCloseTo(0.25, 8);
    expect(res.isPurelyDiffusiveRegime).toBe(true);
  });
});
