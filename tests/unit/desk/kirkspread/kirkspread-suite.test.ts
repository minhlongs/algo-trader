import { describe, it, expect } from 'vitest';
import { KirkSpreadEngine } from '../../../../src/desk/kirkspread/kirkspread-engine.js';
import { KirkSpreadMath } from '../../../../src/desk/kirkspread/kirkspread-math.js';
import { KirkSpreadParams } from '../../../../src/desk/kirkspread/kirkspread-types.js';

describe('Kirk (1995) Two-Asset Spread Option Suite', () => {
  describe('KirkSpreadMath', () => {
    it('calculates adjusted volatility accurately', () => {
      const vol = KirkSpreadMath.calculateAdjustedVolatility(100, 95, 5, 0.3, 0.25, 0.5);
      expect(vol).toBeGreaterThan(0.1);
      expect(vol).toBeLessThan(0.4);
    });
  });

  describe('KirkSpreadEngine Pricing', () => {
    const params: KirkSpreadParams = {
      asset1Forward: 105,
      asset2Forward: 100,
      strike: 3,
      timeToExpiry: 0.5,
      riskFreeRate: 0.05,
      volatility1: 0.25,
      volatility2: 0.20,
      correlation: 0.6,
      isCall: true,
    };

    it('prices European call spread option above intrinsic value', () => {
      const res = KirkSpreadEngine.price(params);
      expect(res.optionPrice).toBeGreaterThan(0);
      expect(res.intrinsicValue).toBeGreaterThan(0);
      expect(res.optionPrice).toBeGreaterThanOrEqual(res.intrinsicValue);
      expect(res.timeValue).toBeGreaterThan(0);
      expect(res.greeks.delta1).toBeGreaterThan(0);
      expect(res.greeks.delta2).toBeLessThan(0);
    });

    it('prices European put spread option with positive time value', () => {
      const putRes = KirkSpreadEngine.price({ ...params, isCall: false });
      expect(putRes.optionPrice).toBeGreaterThan(0);
      expect(putRes.greeks.delta1).toBeLessThan(0);
      expect(putRes.greeks.delta2).toBeGreaterThan(0);
    });

    it('satisfies Margrabe boundary condition when strike is zero', () => {
      const zeroStrikeRes = KirkSpreadEngine.price({ ...params, strike: 0 });
      expect(zeroStrikeRes.optionPrice).toBeGreaterThan(0);
      expect(zeroStrikeRes.adjustedVolatility).toBeCloseTo(
        Math.sqrt(0.25 * 0.25 + 0.20 * 0.20 - 2 * 0.6 * 0.25 * 0.20),
        4
      );
    });

    it('throws on invalid configuration', () => {
      expect(() => KirkSpreadEngine.price({ ...params, asset1Forward: -10 })).toThrow();
      expect(() => KirkSpreadEngine.price({ ...params, correlation: 1.5 })).toThrow();
      expect(() => KirkSpreadEngine.price({ ...params, volatility1: 0 })).toThrow();
    });
  });
});
