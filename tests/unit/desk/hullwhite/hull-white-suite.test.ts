import { describe, expect, it } from 'vitest';
import { HullWhiteEngine } from '../../../../src/desk/hullwhite/hull-white-engine';
import { YieldCurve } from '../../../../src/desk/hullwhite/hull-white-types';

describe('Hull-White Analytical ZCB (Desk 107)', () => {
  class FlatYieldCurve implements YieldCurve {
    constructor(private rate: number) {}
    getDiscountFactor(T: number): number {
      return Math.exp(-this.rate * T);
    }
    getForwardRate(_T: number): number {
      return this.rate;
    }
  }

  it('should recover T=0 yield curve when t=0', () => {
    const curve = new FlatYieldCurve(0.05); // 5% flat curve
    const params = { a: 0.1, sigma: 0.01 };
    
    const t = 0.0;
    const T = 2.0;
    const rt = 0.05; // Current short rate matches the flat curve
    
    const result = HullWhiteEngine.calculateZeroCouponBond(params, curve, rt, t, T);
    
    // P(0, T) should precisely match the initial yield curve discount factor
    expect(result.priceZCB).toBeCloseTo(curve.getDiscountFactor(T), 6);
  });

  it('should pull to par when t approaches T', () => {
    const curve = new FlatYieldCurve(0.05);
    const params = { a: 0.1, sigma: 0.01 };
    
    // At maturity t = T = 5.0
    const result = HullWhiteEngine.calculateZeroCouponBond(params, curve, 0.08, 5.0, 5.0);
    
    expect(result.priceZCB).toBeCloseTo(1.0, 6);
    expect(result.ATmTime).toBeCloseTo(1.0, 6);
    expect(result.BTmTime).toBeCloseTo(0.0, 6);
  });

  it('should calculate ZCB price responding correctly to interest rate shock', () => {
    const curve = new FlatYieldCurve(0.05);
    const params = { a: 0.1, sigma: 0.01 };
    
    const t = 1.0;
    const T = 5.0;
    
    // Short rate jumps from 5% to 8%
    const shockUp = HullWhiteEngine.calculateZeroCouponBond(params, curve, 0.08, t, T);
    // Short rate drops to 2%
    const shockDown = HullWhiteEngine.calculateZeroCouponBond(params, curve, 0.02, t, T);
    
    // Bond prices drop when yields rise
    expect(shockUp.priceZCB).toBeLessThan(shockDown.priceZCB);
  });
});
