import { describe, expect, it } from 'vitest';
import {
  CarteaJaimungal2015Hybrid,
  GatheralJaisson2018Heston,
  Gueant2017OptimalMm,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 292-294 Suite', () => {
  it('Wave 292: Guéant (2017) asymptotic optimal market making quotes', () => {
    const res = Gueant2017OptimalMm.computeGueant2017OptimalMm({
      currentInventoryQ: 5,
      riskAversionGamma: 0.1,
      volatilitySigma: 0.25,
      orderFlowIntensityKappa: 1.5,
      baseArrivalRateA: 10,
    });

    expect(res.baseHalfSpread).toBeGreaterThan(0);
    // Positive inventory skews bid further away and ask closer to mid
    expect(res.optimalBidQuoteOffset).toBeGreaterThan(res.optimalAskQuoteOffset);
    expect(res.expectedSpreadCaptureRate).toBeGreaterThan(0);
  });

  it('Wave 293: Cartea & Jaimungal (2015) hybrid limit and market order execution', () => {
    const resPassive = CarteaJaimungal2015Hybrid.computeCarteaJaimungal2015Hybrid({
      currentInventoryQ: 10,
      remainingHorizonSec: 30,
      quotedHalfSpreadDelta: 0.05,
      limitFillIntensityLambda: 2.0,
      temporaryImpactEta: 0.01,
      inventoryUrgencyPhi: 0.0004,
    });
    expect(resPassive.regimeMode).toBe('PASSIVE_LIMIT_ONLY');

    const resHybrid = CarteaJaimungal2015Hybrid.computeCarteaJaimungal2015Hybrid({
      currentInventoryQ: 800,
      remainingHorizonSec: 10,
      quotedHalfSpreadDelta: 0.02,
      limitFillIntensityLambda: 1.0,
      temporaryImpactEta: 0.005,
      inventoryUrgencyPhi: 0.002,
    });
    expect(resHybrid.regimeMode).toBe('HYBRID_LIMIT_AND_MARKET');
    expect(resHybrid.aggressiveMarketSweepRate).toBeGreaterThan(0);
  });

  it('Wave 294: Gatheral, Jaisson & Rosenbaum (2018) Rough Heston kernel discretization', () => {
    const res = GatheralJaisson2018Heston.computeGatheralJaisson2018Heston({
      hurstExponentH: 0.1,
      horizonSec: 1.0,
      stepsN: 6,
      baselineVarianceV0: 0.04,
      volOfVolNu: 0.3,
    });

    expect(res.kernelWeights).toHaveLength(6);
    expect(res.kernelWeights[0]).toBeGreaterThan(res.kernelWeights[5]);
    expect(res.frontLagWeightShare).toBeGreaterThan(1 / 6);
    expect(res.integratedKernelMass).toBeGreaterThan(0);
  });
});
