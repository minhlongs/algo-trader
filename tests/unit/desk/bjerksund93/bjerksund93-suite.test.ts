import { describe, it, expect } from 'vitest';
import { Bjerksund93Engine } from '../../../../src/desk/bjerksund93/bjerksund93-engine.js';
import { Bjerksund93Math } from '../../../../src/desk/bjerksund93/bjerksund93-math.js';
import { Bjerksund93Params } from '../../../../src/desk/bjerksund93/bjerksund93-types.js';

describe('Bjerksund-Stensland (1993) American Option Suite', () => {
  describe('Bjerksund93Math', () => {
    it('evaluates cumulative normal distribution CDF accurately', () => {
      expect(Bjerksund93Math.normalCdf(0)).toBeCloseTo(0.5, 5);
      expect(Bjerksund93Math.normalCdf(1.96)).toBeCloseTo(0.975, 3);
    });

    it('evaluates phi auxiliary function without NaN', () => {
      const val = Bjerksund93Math.phi(100, 1.0, 1.0, 110, 110, 0.05, 0.02, 0.2);
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    });
  });

  describe('Bjerksund93Engine American Pricing & Greeks', () => {
    const callParams: Bjerksund93Params = {
      spot: 100,
      strike: 100,
      timeToExpiry: 0.5,
      riskFreeRate: 0.08,
      dividendYield: 0.04, // b = 0.04 < r
      volatility: 0.25,
      isCall: true,
    };

    it('prices American call option and ensures value exceeds intrinsic value', () => {
      const res = Bjerksund93Engine.price(callParams);
      expect(res.price).toBeGreaterThan(0);
      expect(res.price).toBeGreaterThanOrEqual(Math.max(0, callParams.spot - callParams.strike));
      expect(res.earlyExercisePremium).toBeGreaterThanOrEqual(0);
      expect(res.triggerPrice).toBeGreaterThan(callParams.strike);
    });

    it('prices American put option via symmetry transformation', () => {
      const putRes = Bjerksund93Engine.price({ ...callParams, isCall: false });
      expect(putRes.price).toBeGreaterThan(0);
      expect(putRes.price).toBeGreaterThanOrEqual(Math.max(0, callParams.strike - callParams.spot));
      expect(putRes.earlyExercisePremium).toBeGreaterThanOrEqual(0);
      expect(putRes.greeks.delta).toBeLessThan(0);
    });

    it('verifies analytical finite difference Greeks', () => {
      const res = Bjerksund93Engine.price(callParams);
      expect(res.greeks.delta).toBeGreaterThan(0);
      expect(res.greeks.delta).toBeLessThan(1);
      expect(res.greeks.gamma).toBeGreaterThan(0);
      expect(res.greeks.vega).toBeGreaterThan(0);
      expect(res.greeks.theta).toBeLessThan(0); // Time decay
    });

    it('validates parameter boundaries', () => {
      expect(() => Bjerksund93Engine.price({ ...callParams, spot: -1 })).toThrow();
      expect(() => Bjerksund93Engine.price({ ...callParams, timeToExpiry: 0 })).toThrow();
    });
  });
});
