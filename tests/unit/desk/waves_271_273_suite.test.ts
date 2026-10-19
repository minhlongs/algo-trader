import { describe, expect, it } from 'vitest';
import {
  Bouchaud2004Response,
  CarteaJaimungal2015LimitMarket,
  GueantLehalle2015Intensity,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 271-273 Suite', () => {
  it('Wave 271: Cartea & Jaimungal (2015) hybrid limit and market order execution', () => {
    const res = CarteaJaimungal2015LimitMarket.computeCartea2015LimitMarketExecution({
      initialInventory: 500,
      horizonSec: 60,
      steps: 12,
      limitFillIntensityLambda: 4.5,
      limitFillDecayKappa: 10,
      temporaryImpactEta: 0.002,
      riskAversionPhi: 0.001,
    });

    expect(res.trajectory).toHaveLength(13);
    expect(res.passiveLimitShareRatio).toBeGreaterThan(0);
    expect(res.passiveLimitShareRatio).toBeLessThanOrEqual(1);
    expect(res.totalSpreadCaptured).toBeGreaterThan(0);
    expect(res.terminalInventory).toBeLessThan(500);
  });

  it('Wave 272: Guéant & Lehalle (2015) general power-exponential intensity optimal quotes', () => {
    const res = GueantLehalle2015Intensity.computeGueantLehalle2015Quotes({
      maxInventory: 5,
      horizonSec: 120,
      scaleA: 2.0,
      sensitivityKappa: 15.0,
      powerExponentBeta: 3.0,
      riskAversionGamma: 0.05,
      volatilitySigma: 0.25,
    });

    expect(res.quotesByInventory).toHaveLength(5);
    expect(res.asymptoticBaseSpread).toBeCloseTo(3.0 / (15.0 * 2.0), 5);
    expect(res.intensityElasticity).toBeCloseTo(1.5, 5);
    // Higher inventory induces tighter optimal half-spread to accelerate fills
    expect(res.quotesByInventory[4].optimalHalfSpread).toBeLessThan(
      res.quotesByInventory[0].optimalHalfSpread,
    );
    expect(res.quotesByInventory[4].executionIntensity).toBeGreaterThan(
      res.quotesByInventory[0].executionIntensity,
    );
  });

  it('Wave 273: Bouchaud et al. (2004) bare propagator and price response curve', () => {
    const res = Bouchaud2004Response.computeBouchaud2004ResponseCurve({
      maxLag: 10,
      bareImpactGamma0: 0.5,
      lagOffsetL0: 1.0,
      propagatorDecayBeta: 0.25,
      signAutocorrC0: 0.3,
      signDecayGamma: 0.5,
      uncorrNoiseSigma2: 0.02,
    });

    expect(res.curve).toHaveLength(10);
    expect(res.criticalBetaExponent).toBeCloseTo(0.25, 5);
    expect(res.isDiffusiveBalanced).toBe(true);
    expect(res.curve[0].barePropagatorG0).toBeGreaterThan(res.curve[9].barePropagatorG0);
    expect(res.curve[9].priceResponseR).toBeGreaterThan(res.curve[0].barePropagatorG0);
  });
});
