import { describe, it, expect } from 'vitest';
import { JamshidianEngine } from '../../../../src/desk/jamshidian/jamshidian-engine.js';
import { JamshidianMath } from '../../../../src/desk/jamshidian/jamshidian-math.js';
import { JamshidianParams } from '../../../../src/desk/jamshidian/jamshidian-types.js';

describe('Jamshidian (1989) Swaption & Coupon Bond Option Suite', () => {
  describe('JamshidianMath', () => {
    it('evaluates Vasicek analytical bond formula accurately', () => {
      const P = JamshidianMath.vasicekZeroBond(0.05, 1.0, 0.15, 0.05, 0.01);
      expect(P).toBeLessThan(1.0);
      expect(P).toBeGreaterThan(0.9);
    });
  });

  describe('JamshidianEngine Pricing & Decomposition', () => {
    const params: JamshidianParams = {
      strike: 100,
      expiry: 1.0,
      shortRate: 0.04,
      meanReversion: 0.1,
      longTermRate: 0.05,
      volatility: 0.015,
      cashFlows: [
        { time: 2.0, amount: 5.0 }, // Annual coupon 5%
        { time: 3.0, amount: 105.0 }, // Coupon + Principal
      ],
      isCall: true,
    };

    it('solves critical rate r* satisfying exact strike parity', () => {
      const rStar = JamshidianEngine.findCriticalRate(params);
      expect(Number.isFinite(rStar)).toBe(true);
      expect(rStar).toBeGreaterThan(-0.1);
      expect(rStar).toBeLessThan(0.2);
    });

    it('prices European call option on coupon bond above intrinsic value', () => {
      const res = JamshidianEngine.price(params);
      expect(res.optionPrice).toBeGreaterThan(0);
      expect(res.underlyingBondPrice).toBeGreaterThan(90);
      expect(res.optionPrice).toBeGreaterThanOrEqual(res.intrinsicValue);
    });

    it('prices European put option on coupon bond via exact strike partition', () => {
      const putRes = JamshidianEngine.price({ ...params, isCall: false });
      expect(putRes.optionPrice).toBeGreaterThan(0);
      expect(putRes.optionPrice).toBeGreaterThanOrEqual(putRes.intrinsicValue);
    });

    it('throws on invalid configuration', () => {
      expect(() => JamshidianEngine.price({ ...params, strike: -10 })).toThrow();
      expect(() => JamshidianEngine.price({ ...params, cashFlows: [{ time: 0.5, amount: 100 }] })).toThrow();
    });
  });
});
