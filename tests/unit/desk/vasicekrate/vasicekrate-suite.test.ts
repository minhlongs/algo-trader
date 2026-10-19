import { describe, it, expect } from 'vitest';
import { VasicekEngine } from '../../../../src/desk/vasicekrate/vasicekrate-engine.js';
import { VasicekMath } from '../../../../src/desk/vasicekrate/vasicekrate-math.js';
import { VasicekParams } from '../../../../src/desk/vasicekrate/vasicekrate-types.js';

describe('Vasicek (1977) Gaussian Short-Rate Suite', () => {
  describe('VasicekMath Affine Coefficients', () => {
    it('evaluates B(tau) sensitivity function correctly', () => {
      const B = VasicekMath.calculateB(1.0, 0.2);
      expect(B).toBeCloseTo((1 - Math.exp(-0.2)) / 0.2, 6);
      expect(VasicekMath.calculateB(0, 0.2)).toBe(0);
    });

    it('evaluates A(tau) convexity function correctly', () => {
      const A = VasicekMath.calculateA(1.0, 0.2, 0.05, 0.02);
      expect(A).toBeGreaterThan(0);
      expect(A).toBeLessThan(1.5);
    });
  });

  describe('VasicekEngine Zero-Coupon Bond Pricing & Yield Curves', () => {
    const params: VasicekParams = {
      currentRate: 0.03, // 3% current short rate
      meanReversionSpeed: 0.15, // kappa = 0.15
      longTermMeanRate: 0.05, // theta = 5%
      volatility: 0.015, // sigma = 1.5%
    };

    it('prices zero-coupon bond and computes yield rate', () => {
      const res = VasicekEngine.priceZeroCouponBond(params, 2.0);
      expect(res.price).toBeLessThan(1.0);
      expect(res.price).toBeGreaterThan(0.8);
      expect(res.yieldRate).toBeGreaterThan(0.02);
      expect(res.yieldRate).toBeLessThan(0.06);
      expect(res.yieldVolatility).toBeGreaterThan(0);
    });

    it('generates multi-maturity yield term structure curve', () => {
      const maturities = [0.5, 1.0, 2.0, 5.0, 10.0];
      const curveRes = VasicekEngine.generateYieldCurve(params, maturities);
      expect(curveRes.curve.length).toBe(5);

      // Current rate 3% is below theta 5%, so yield curve should be upward sloping
      expect(curveRes.curve[4].yieldRate).toBeGreaterThan(curveRes.curve[0].yieldRate);

      // Long term asymptotic yield check
      expect(curveRes.longTermAsymptoticYield).toBeLessThan(params.longTermMeanRate);
      expect(curveRes.longTermAsymptoticYield).toBeGreaterThan(0.04);
    });

    it('throws on invalid inputs', () => {
      expect(() => VasicekEngine.priceZeroCouponBond({ ...params, meanReversionSpeed: -0.1 }, 1)).toThrow();
      expect(() => VasicekEngine.priceZeroCouponBond(params, -1)).toThrow();
    });
  });
});
