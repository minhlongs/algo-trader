import { describe, it, expect } from 'vitest';
import { JltEngine } from '../../../../src/desk/jltcredit/jlt-engine.js';
import { JltMath } from '../../../../src/desk/jltcredit/jlt-math.js';
import { JltBondParams } from '../../../../src/desk/jltcredit/jlt-types.js';

describe('Jarrow-Lando-Turnbull (1997) Credit Migration Suite', () => {
  describe('JltMath Matrix Operations', () => {
    it('verifies row-stochasticity of benchmark transition matrix', () => {
      const isStochastic = JltMath.isRowStochastic(JltEngine.BENCHMARK_TRANSITION_P);
      expect(isStochastic).toBe(true);
    });

    it('computes matrix power correctly for identity and 2x2', () => {
      const A = [
        [0.9, 0.1],
        [0.0, 1.0],
      ];
      const A2 = JltMath.matrixPower(A, 2);
      expect(A2[0][0]).toBeCloseTo(0.81, 6);
      expect(A2[0][1]).toBeCloseTo(0.19, 6);
      expect(A2[1][1]).toBeCloseTo(1.0, 6);
    });

    it('scales physical matrix P to risk-neutral Q with elevated default probabilities', () => {
      const P = JltEngine.BENCHMARK_TRANSITION_P;
      const Q = JltMath.scaleToRiskNeutral(P, JltEngine.BENCHMARK_RISK_PREMIA, JltEngine.DEFAULT_INDEX);

      expect(JltMath.isRowStochastic(Q)).toBe(true);
      // For BBB (index 3), Q default prob should exceed P default prob
      const bbbIndex = 3;
      expect(Q[bbbIndex][JltEngine.DEFAULT_INDEX]).toBeGreaterThan(P[bbbIndex][JltEngine.DEFAULT_INDEX]);
    });
  });

  describe('JltEngine Bond Pricing and Spread Curve', () => {
    it('validates rating parameters', () => {
      expect(() => JltEngine.validate({ rating: 'INVALID' as any, maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 })).toThrow();
      expect(() => JltEngine.validate({ rating: 'BBB', maturity: -1, recoveryRate: 0.4, riskFreeRate: 0.04 })).toThrow();
      expect(() => JltEngine.validate({ rating: 'BBB', maturity: 1, recoveryRate: 1.5, riskFreeRate: 0.04 })).toThrow();
    });

    it('prices 1-year bonds with monotone spread ordering across rating tiers', () => {
      const aaaRes = JltEngine.priceBond({ rating: 'AAA', maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 });
      const aRes = JltEngine.priceBond({ rating: 'A', maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 });
      const bbbRes = JltEngine.priceBond({ rating: 'BBB', maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 });
      const bRes = JltEngine.priceBond({ rating: 'B', maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 });
      const cccRes = JltEngine.priceBond({ rating: 'CCC', maturity: 1, recoveryRate: 0.4, riskFreeRate: 0.04 });

      // Lower rating -> lower bond price
      expect(aaaRes.defaultableZeroPrice).toBeGreaterThanOrEqual(aRes.defaultableZeroPrice);
      expect(aRes.defaultableZeroPrice).toBeGreaterThan(bbbRes.defaultableZeroPrice);
      expect(bbbRes.defaultableZeroPrice).toBeGreaterThan(bRes.defaultableZeroPrice);
      expect(bRes.defaultableZeroPrice).toBeGreaterThan(cccRes.defaultableZeroPrice);

      // Lower rating -> higher credit spread
      expect(aaaRes.creditSpreadBps).toBeLessThanOrEqual(aRes.creditSpreadBps);
      expect(aRes.creditSpreadBps).toBeLessThan(bbbRes.creditSpreadBps);
      expect(bbbRes.creditSpreadBps).toBeLessThan(bRes.creditSpreadBps);
      expect(bRes.creditSpreadBps).toBeLessThan(cccRes.creditSpreadBps);
    });

    it('ensures defaultable zero price is bounded by risk-free zero price', () => {
      const res = JltEngine.priceBond({ rating: 'BBB', maturity: 3, recoveryRate: 0.4, riskFreeRate: 0.05 });
      expect(res.defaultableZeroPrice).toBeLessThan(res.riskFreeZeroPrice);
      expect(res.defaultableZeroPrice).toBeGreaterThan(0);
      expect(res.hazardRate).toBeGreaterThan(0);
    });

    it('generates multi-year credit spread curves', () => {
      const curve = JltEngine.generateCreditCurve('BBB', [1, 2, 3, 5]);
      expect(curve.length).toBe(4);
      expect(curve[0].maturity).toBe(1);
      expect(curve[3].maturity).toBe(5);
      // Cumulative default probability increases with maturity
      expect(curve[3].cumulativeDefaultProbQ).toBeGreaterThan(curve[0].cumulativeDefaultProbQ);
    });
  });
});
