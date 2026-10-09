import { describe, it, expect } from 'vitest';
import { ChenRateEngine } from '../../../../src/desk/chenrate/chenrate-engine.js';
import { ChenRateMath } from '../../../../src/desk/chenrate/chenrate-math.js';
import { ChenRateParams } from '../../../../src/desk/chenrate/chenrate-types.js';

describe('Chen (1996) Three-Factor Short Rate Suite', () => {
  describe('ChenRateMath', () => {
    it('evaluates expected mean convergence towards long term mean', () => {
      const eThetaShort = ChenRateMath.expectedMean(0.06, 0.04, 0.5, 0.5);
      const eThetaLong = ChenRateMath.expectedMean(0.06, 0.04, 0.5, 10.0);
      expect(eThetaShort).toBeLessThan(0.06);
      expect(eThetaShort).toBeGreaterThan(0.04);
      expect(eThetaLong).toBeCloseTo(0.04, 2);
    });

    it('evaluates expected variance convergence towards long term variance', () => {
      const eVarLong = ChenRateMath.expectedVariance(0.02, 0.01, 1.0, 15.0);
      expect(eVarLong).toBeCloseTo(0.01, 4);
    });
  });

  describe('ChenRateEngine Term Structure', () => {
    const params: ChenRateParams = {
      currentRate: 0.03,
      currentMean: 0.04,
      currentVariance: 0.0004,
      rateMeanReversion: 0.8,
      meanReversionOfMean: 0.2,
      meanReversionOfVar: 0.4,
      longTermMean: 0.05,
      longTermVar: 0.0002,
      volOfMean: 0.01,
      volOfVar: 0.005,
    };

    it('evaluates term structure expectations and yields', () => {
      const res = ChenRateEngine.evaluateTermStructure(params, 2.0);
      expect(res.expectedRate).toBeGreaterThan(0.03);
      expect(res.expectedMean).toBeGreaterThan(0.04);
      expect(res.zeroBondPrice).toBeLessThan(1.0);
      expect(res.zeroBondPrice).toBeGreaterThan(0.8);
      expect(res.zeroYield).toBeGreaterThan(0.02);
      expect(res.asymptoticRate).toBe(0.05);
    });

    it('throws error for invalid parameter inputs', () => {
      expect(() => ChenRateEngine.evaluateTermStructure(params, -1.0)).toThrow();
      expect(() =>
        ChenRateEngine.evaluateTermStructure({ ...params, rateMeanReversion: -0.1 }, 1.0)
      ).toThrow();
    });
  });
});
