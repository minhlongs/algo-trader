import { describe, expect, it } from 'vitest';
import { VasicekTermStructureEngine } from '../../../../src/desk/vasicek/vasicek-term-structure-engine';
import { VasicekModelParameters } from '../../../../src/desk/vasicek/vasicek-types';

describe('VasicekTermStructureEngine Suite', () => {
  const engine = new VasicekTermStructureEngine();

  const standardParams: VasicekModelParameters = {
    currentShortRateR0: 0.04,  // 4% spot rate
    speedOfReversionA: 0.20,   // a = 0.2
    longTermMeanB: 0.06,       // b = 6% long-term mean
    volatilitySigma: 0.015,    // 1.5% short rate vol
  };

  it('should price zero-coupon bond and calculate yield and forward rates', () => {
    const result = engine.priceZeroCouponBond(standardParams, 5.0, 100.0);

    expect(result.maturityYears).toBe(5.0);
    expect(result.bondPriceUsd).toBeGreaterThan(70.0);
    expect(result.bondPriceUsd).toBeLessThan(100.0);
    expect(result.continuouslyCompoundedYieldPct).toBeGreaterThan(4.0);
    expect(result.continuouslyCompoundedYieldPct).toBeLessThan(6.0);
    expect(result.durationB).toBeGreaterThan(0);
    expect(result.convexityFactorA).toBeGreaterThan(0);
  });

  it('should generate upward-sloping yield curve when short rate is below long term mean', () => {
    const tenors = [1, 2, 5, 10, 30];
    const curve = engine.generateYieldCurve(standardParams, tenors);

    expect(curve.length).toBe(5);
    // Spot rate is 4%, mean is 6% -> Curve should slope upwards with tenor
    expect(curve[0]!.yieldPct).toBeLessThan(curve[2]!.yieldPct);
    expect(curve[2]!.yieldPct).toBeLessThan(curve[4]!.yieldPct);
  });

  it('should throw on non-positive maturity or speed of reversion', () => {
    expect(() => engine.priceZeroCouponBond(standardParams, -1.0)).toThrow('Maturity must be positive');
  });
});
