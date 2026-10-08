import { describe, expect, it } from 'vitest';
import { G2ppEngine } from '../../../../src/desk/g2pp/g2pp-engine';
import { G2ppParameters, G2ppState } from '../../../../src/desk/g2pp/g2pp-types';
import { G2ppVariance } from '../../../../src/desk/g2pp/g2pp-variance';

describe('G2ppEngine Suite (Desk 84)', () => {
  const engine = new G2ppEngine();

  const standardParams: G2ppParameters = {
    a: 0.1,      // Mean reversion factor 1
    b: 0.3,      // Mean reversion factor 2
    sigma: 0.01, // 1% volatility factor 1
    eta: 0.015,  // 1.5% volatility factor 2
    rho: -0.4,   // Negative correlation between factors
  };

  const initialState: G2ppState = {
    x: 0.005, // 50 bps deviation
    y: -0.002, // -20 bps deviation
    t: 0.0,
  };

  it('should calculate variance integral and derivative accurately', () => {
    const v5 = G2ppVariance.calculate(standardParams, 5.0);
    const dV5 = G2ppVariance.calculateDerivative(standardParams, 5.0);

    expect(v5).toBeGreaterThan(0.0);
    expect(dV5).toBeGreaterThan(0.0);

    // Finite difference check of variance derivative
    const h = 1e-5;
    const v5Plus = G2ppVariance.calculate(standardParams, 5.0 + h);
    const numDeriv = (v5Plus - v5) / h;
    expect(Math.abs(dV5 - numDeriv)).toBeLessThan(1e-4);
  });

  it('should price zero-coupon bond and calculate YTM and forward rates', () => {
    const res = engine.priceZeroCouponBond(standardParams, initialState, 5.0, 0.04);

    expect(res.maturityTau).toBe(5.0);
    expect(res.price).toBeGreaterThan(0.7);
    expect(res.price).toBeLessThan(1.0);
    expect(res.yieldToMaturityPct).toBeGreaterThan(2.0);
    expect(res.yieldToMaturityPct).toBeLessThan(6.0);
    expect(res.instantaneousForwardRatePct).toBeGreaterThan(0.0);
  });

  it('should throw on singular parameters or invalid maturities', () => {
    expect(() =>
      G2ppVariance.calculate(
        {
          ...standardParams,
          b: 0.1, // a == b causes singularity
        },
        2.0
      )
    ).toThrow('G2++ parameters a and b must be distinct');

    expect(() =>
      engine.priceZeroCouponBond(standardParams, initialState, -1.0)
    ).toThrow('Maturity T must be strictly greater than current time t');
  });
});
