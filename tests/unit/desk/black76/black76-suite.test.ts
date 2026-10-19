import { describe, it, expect } from 'vitest';
import { Black76Engine } from '../../../../src/desk/black76/black76-engine.js';
import { Black76Math } from '../../../../src/desk/black76/black76-math.js';
import { Black76Params } from '../../../../src/desk/black76/black76-types.js';

describe('Black (1976) Futures Option Suite', () => {
  describe('Black76Math', () => {
    it('evaluates normal CDF accurately', () => {
      expect(Black76Math.normalCdf(0)).toBeCloseTo(0.5, 5);
      expect(Black76Math.normalCdf(1.96)).toBeCloseTo(0.975, 3);
    });

    it('computes d1 and d2 correctly', () => {
      const d1 = Black76Math.calculateD1(100, 100, 1.0, 0.2);
      expect(d1).toBeCloseTo(0.1, 5);
      const d2 = Black76Math.calculateD2(d1, 1.0, 0.2);
      expect(d2).toBeCloseTo(-0.1, 5);
    });
  });

  describe('Black76Engine Pricing & Greeks', () => {
    const params: Black76Params = {
      forwardPrice: 100,
      strikePrice: 100,
      timeToExpiry: 0.5,
      riskFreeRate: 0.05,
      volatility: 0.2,
      isCall: true,
    };

    it('prices ATM call option and verifies analytical Greeks', () => {
      const res = Black76Engine.price(params);
      expect(res.price).toBeGreaterThan(0);
      expect(res.greeks.delta).toBeGreaterThan(0);
      expect(res.greeks.delta).toBeLessThan(1);
      expect(res.greeks.gamma).toBeGreaterThan(0);
      expect(res.greeks.vega).toBeGreaterThan(0);
    });

    it('verifies Put-Call parity for futures options: Call - Put = e^(-rT)*(F - K)', () => {
      const callRes = Black76Engine.price(params);
      const putRes = Black76Engine.price({ ...params, isCall: false });

      const discount = Math.exp(-params.riskFreeRate * params.timeToExpiry);
      const expectedParity = discount * (params.forwardPrice - params.strikePrice);
      expect(callRes.price - putRes.price).toBeCloseTo(expectedParity, 6);
    });

    it('validates parameter constraints', () => {
      expect(() => Black76Engine.price({ ...params, forwardPrice: -10 })).toThrow();
      expect(() => Black76Engine.price({ ...params, volatility: 0 })).toThrow();
    });
  });
});
