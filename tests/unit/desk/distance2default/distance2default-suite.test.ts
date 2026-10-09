import { describe, it, expect } from 'vitest';
import { DistanceToDefaultEngine } from '../../../../src/desk/distance2default/distance2default-engine.js';
import { DistanceToDefaultMath } from '../../../../src/desk/distance2default/distance2default-math.js';
import { DistanceToDefaultParams } from '../../../../src/desk/distance2default/distance2default-types.js';

describe('Merton (1974) Distance-to-Default & Structural CDS Suite', () => {
  describe('DistanceToDefaultMath', () => {
    it('calculates d1/d2 under Merton asset structural framework', () => {
      const { d1, d2 } = DistanceToDefaultMath.calculateD1D2(100, 80, 0.05, 0.25, 1);
      expect(d1).toBeGreaterThan(0);
      expect(d2).toBeLessThan(d1);
    });
  });

  describe('DistanceToDefaultEngine Inversion Solver', () => {
    const params: DistanceToDefaultParams = {
      equityValue: 50, // $50M market cap
      equityVolatility: 0.40, // 40% equity vol
      debtFaceValue: 50, // $50M debt face value
      riskFreeRate: 0.05,
      timeHorizon: 1.0,
    };

    it('inverts unobservable asset value V and asset volatility sigma_V', () => {
      const res = DistanceToDefaultEngine.solve(params);
      expect(res.converged).toBe(true);
      expect(res.assetValue).toBeGreaterThan(params.equityValue);
      expect(res.assetVolatility).toBeLessThan(params.equityVolatility); // De-leveraged vol
      expect(res.distanceToDefault).toBeGreaterThan(0);
      expect(res.physicalDefaultProbability).toBeGreaterThan(0);
      expect(res.physicalDefaultProbability).toBeLessThan(0.20);
      expect(res.creditSpreadBps).toBeGreaterThan(0);
    });

    it('exhibits higher default probability and credit spread for highly levered firms', () => {
      const highLeverageParams: DistanceToDefaultParams = {
        ...params,
        debtFaceValue: 150, // Much higher debt
      };
      const normalRes = DistanceToDefaultEngine.solve(params);
      const distressedRes = DistanceToDefaultEngine.solve(highLeverageParams);

      expect(distressedRes.distanceToDefault).toBeLessThan(normalRes.distanceToDefault);
      expect(distressedRes.physicalDefaultProbability).toBeGreaterThan(normalRes.physicalDefaultProbability);
      expect(distressedRes.creditSpreadBps).toBeGreaterThan(normalRes.creditSpreadBps);
    });

    it('validates input boundaries', () => {
      expect(() => DistanceToDefaultEngine.solve({ ...params, equityValue: 0 })).toThrow();
      expect(() => DistanceToDefaultEngine.solve({ ...params, equityVolatility: -0.1 })).toThrow();
    });
  });
});
