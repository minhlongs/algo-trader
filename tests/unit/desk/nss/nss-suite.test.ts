import { describe, expect, it } from 'vitest';
import { NssCurve } from '../../../../src/desk/nss/nss-curve';
import { NssEngine } from '../../../../src/desk/nss/nss-engine';
import { NssParameters } from '../../../../src/desk/nss/nss-types';

describe('NssEngine Suite (Desk 87)', () => {
  const engine = new NssEngine();

  const standardParams: NssParameters = {
    beta0: 5.0,  // 5% asymptotic long-term rate
    beta1: -2.0, // Inverted short-end slope
    beta2: 1.5,  // Medium hump
    beta3: -1.0, // Secondary hump
    tau1: 1.5,   // Scale factor 1
    tau2: 4.0,   // Scale factor 2
  };

  it('should calculate NSS zero rate and forward rate accurately', () => {
    const pointShort = NssCurve.calculatePoint(standardParams, 0.001);
    // At m -> 0, zeroRate -> beta0 + beta1 = 5.0 - 2.0 = 3.0
    expect(pointShort.zeroRatePct).toBeCloseTo(3.0, 1);
    expect(pointShort.discountFactor).toBeCloseTo(1.0, 3);

    const pointLong = NssCurve.calculatePoint(standardParams, 100.0);
    // At m -> infinity, zeroRate -> beta0 = 5.0
    expect(pointLong.zeroRatePct).toBeCloseTo(5.0, 0);
    expect(pointLong.discountFactor).toBeLessThan(0.1);
  });

  it('should price coupon bond and calculate duration and convexity', () => {
    const res = engine.priceCouponBond(standardParams, 4.0, 10.0, 2, 100.0);

    expect(res.price).toBeGreaterThan(80.0);
    expect(res.price).toBeLessThan(120.0);
    expect(res.yieldToMaturityPct).toBeGreaterThan(3.0);
    expect(res.macaulayDurationYears).toBeGreaterThan(5.0);
    expect(res.macaulayDurationYears).toBeLessThan(10.0);
    expect(res.modifiedDurationYears).toBeLessThan(res.macaulayDurationYears);
    expect(res.convexity).toBeGreaterThan(0.0);
  });

  it('should throw on non-positive scale parameters or maturity', () => {
    expect(() =>
      NssCurve.calculatePoint(
        {
          ...standardParams,
          tau1: -1.0,
        },
        5.0
      )
    ).toThrow('NSS scale parameters tau1 and tau2 must be strictly positive');

    expect(() =>
      engine.priceCouponBond(standardParams, 5.0, 0.0)
    ).toThrow('Maturity must be positive');
  });
});
