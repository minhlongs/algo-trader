import { describe, it, expect } from 'vitest';
import { MertonDividendEngine } from '../../../../src/desk/mertondividend/mertondividend-engine.js';
import { MertonDividendMath } from '../../../../src/desk/mertondividend/mertondividend-math.js';
import { MertonDividendParams } from '../../../../src/desk/mertondividend/mertondividend-types.js';

describe('Merton (1973) Continuous Dividend Option Suite', () => {
  describe('MertonDividendMath Normal Distributions & d1/d2', () => {
    it('evaluates standard normal CDF correctly at key values', () => {
      expect(MertonDividendMath.normalCdf(0)).toBeCloseTo(0.5, 5);
      expect(MertonDividendMath.normalCdf(1.96)).toBeCloseTo(0.975, 3);
      expect(MertonDividendMath.normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    });

    it('calculates d1 and d2 incorporating continuous dividend yield', () => {
      const { d1, d2 } = MertonDividendMath.calculateD1D2(100, 100, 1, 0.05, 0.02, 0.2);
      expect(d1).toBeCloseTo(0.25, 3);
      expect(d2).toBeCloseTo(0.05, 3);
    });
  });

  describe('MertonDividendEngine Pricing & Greeks', () => {
    const baseCallParams: MertonDividendParams = {
      spot: 100,
      strike: 100,
      timeToExpiry: 1,
      riskFreeRate: 0.05,
      dividendYield: 0.03,
      volatility: 0.2,
      isCall: true,
    };

    it('prices European call option accurately and validates put-call parity', () => {
      const call = MertonDividendEngine.price(baseCallParams);
      const put = MertonDividendEngine.price({ ...baseCallParams, isCall: false });

      // Put-Call parity with dividend: C - P = S*e^(-qT) - K*e^(-rT)
      const S_eqT = baseCallParams.spot * Math.exp(-baseCallParams.dividendYield * baseCallParams.timeToExpiry);
      const K_erT = baseCallParams.strike * Math.exp(-baseCallParams.riskFreeRate * baseCallParams.timeToExpiry);
      const parityDiff = call.price - put.price;
      const expectedDiff = S_eqT - K_erT;

      expect(parityDiff).toBeCloseTo(expectedDiff, 5);
      expect(call.price).toBeGreaterThan(0);
      expect(put.price).toBeGreaterThan(0);
    });

    it('verifies analytical Greeks consistency', () => {
      const res = MertonDividendEngine.price(baseCallParams);
      expect(res.greeks.delta).toBeGreaterThan(0);
      expect(res.greeks.delta).toBeLessThan(1);
      expect(res.greeks.gamma).toBeGreaterThan(0);
      expect(res.greeks.vega).toBeGreaterThan(0);
      expect(res.greeks.dividendRho).toBeLessThan(0); // Call price decreases with higher dividend yield
    });

    it('throws on invalid parameters', () => {
      expect(() => MertonDividendEngine.price({ ...baseCallParams, spot: -10 })).toThrow();
      expect(() => MertonDividendEngine.price({ ...baseCallParams, timeToExpiry: 0 })).toThrow();
      expect(() => MertonDividendEngine.price({ ...baseCallParams, volatility: -0.1 })).toThrow();
    });
  });
});
