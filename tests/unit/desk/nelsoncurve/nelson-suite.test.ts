import { describe, it, expect } from 'vitest';
import { NelsonEngine } from '../../../../src/desk/nelsoncurve/nelson-engine.js';
import { NelsonMath } from '../../../../src/desk/nelsoncurve/nelson-math.js';
import { NelsonSvenssonParams } from '../../../../src/desk/nelsoncurve/nelson-types.js';

describe('Nelson-Siegel-Svensson Extended Credit & Yield Curve Engine', () => {
  const sovereignCurve: NelsonSvenssonParams = {
    beta0: 0.045, // 4.5% long-term asymptote
    beta1: -0.020, // short rate = 0.045 - 0.020 = 2.5%
    beta2: 0.015, // first hump
    beta3: -0.010, // second hump
    tau1: 1.5,
    tau2: 6.0,
  };

  const corporateCurve: NelsonSvenssonParams = {
    beta0: 0.065, // 6.5% long term
    beta1: -0.010, // short rate = 5.5%
    beta2: 0.010,
    beta3: -0.005,
    tau1: 1.5,
    tau2: 6.0,
  };

  it('correctly models short rate and asymptotic zero rate limits', () => {
    const shortRate = NelsonMath.calculateZeroRate(sovereignCurve, 0.0001);
    const expectedShort = sovereignCurve.beta0 + sovereignCurve.beta1;
    expect(shortRate).toBeCloseTo(expectedShort, 3);

    const longRate = NelsonMath.calculateZeroRate(sovereignCurve, 50);
    expect(longRate).toBeCloseTo(sovereignCurve.beta0, 2);
  });

  it('generates consistent discount factors monotonically decreasing over time', () => {
    const res = NelsonEngine.buildYieldCurve(sovereignCurve);
    expect(res.spotPoints.length).toBeGreaterThan(5);

    for (let i = 1; i < res.spotPoints.length; i++) {
      expect(res.spotPoints[i].discountFactor).toBeLessThan(res.spotPoints[i - 1].discountFactor);
    }
  });

  it('computes instantaneous forward rates matching analytical properties', () => {
    const f0 = NelsonMath.calculateInstantaneousForward(sovereignCurve, 0.001);
    expect(f0).toBeCloseTo(sovereignCurve.beta0 + sovereignCurve.beta1, 2);

    const fLong = NelsonMath.calculateInstantaneousForward(sovereignCurve, 60);
    expect(fLong).toBeCloseTo(sovereignCurve.beta0, 2);
  });

  it('builds valid credit spread curves with positive spreads and survival decay', () => {
    const spreads = NelsonEngine.buildCreditSpreadCurve(sovereignCurve, corporateCurve, 0.40);
    expect(spreads.length).toBeGreaterThan(0);

    for (const pt of spreads) {
      expect(pt.creditSpreadBps).toBeGreaterThan(0);
      expect(pt.survivalProbability).toBeGreaterThan(0);
      expect(pt.survivalProbability).toBeLessThanOrEqual(1.0);
    }

    // Longer maturity has lower survival probability
    expect(spreads[spreads.length - 1].survivalProbability).toBeLessThan(spreads[0].survivalProbability);
  });

  it('validates scale parameters and rejects non-positive tau values', () => {
    expect(() => NelsonEngine.buildYieldCurve({ ...sovereignCurve, tau1: -1 })).toThrow(/strictly positive/);
    expect(() => NelsonEngine.buildYieldCurve({ ...sovereignCurve, tau2: 0 })).toThrow(/strictly positive/);
  });
});
