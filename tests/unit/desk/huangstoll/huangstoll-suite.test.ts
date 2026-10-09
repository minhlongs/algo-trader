import { describe, it, expect } from 'vitest';
import { HuangStollEngine } from '../../../../src/desk/huangstoll/huangstoll-engine.js';
import { HuangStollMath } from '../../../../src/desk/huangstoll/huangstoll-math.js';
import { HuangStollObservation } from '../../../../src/desk/huangstoll/huangstoll-types.js';

describe('Huang-Stoll (1997) Spread Decomposition Suite', () => {
  describe('HuangStollMath 2D Regression', () => {
    it('solves 2D regression accurately', () => {
      const x1 = [1, 2, 3, 4, 5];
      const x2 = [2, 1, 0, -1, -2];
      const y = x1.map((val, i) => 0.4 * val - 0.2 * x2[i]);

      const res = HuangStollMath.solve2DRegression(y, x1, x2);
      expect(res.beta1).toBeCloseTo(0.4, 5);
      expect(res.beta2).toBeCloseTo(-0.2, 5);
    });

    it('computes trade persistence probability', () => {
      const directions = [1, 1, 1, -1, -1];
      const pi = HuangStollMath.computeTradePersistence(directions);
      // 4 transitions: (1->1 yes), (1->1 yes), (1->-1 no), (-1->-1 yes) => 3/4 = 0.75
      expect(pi).toBeCloseTo(0.75, 4);
    });
  });

  describe('HuangStollEngine Spread Decomposition', () => {
    it('decomposes synthetic trade series into non-negative shares summing to 1', () => {
      const observations: HuangStollObservation[] = [];
      let mid = 100.0;
      const spread = 0.10;

      for (let t = 0; t < 50; t++) {
        const dir = t % 3 === 0 ? -1 : 1;
        mid += 0.02 * dir + (t % 2 === 0 ? 0.005 : -0.005);
        const tradePrice = mid + dir * (spread / 2);
        observations.push({
          tradePrice,
          quoteMidpoint: mid,
          tradeDirection: dir,
          quotedSpread: spread,
        });
      }

      const res = HuangStollEngine.decomposeSpread(observations);
      expect(res.sampleSize).toBe(50);
      expect(res.effectiveSpread).toBeGreaterThan(0);
      expect(res.adverseSelectionShare).toBeGreaterThanOrEqual(0);
      expect(res.orderProcessingShare).toBeGreaterThanOrEqual(0);
      expect(res.inventoryHoldingShare).toBeGreaterThanOrEqual(0);

      // Components should sum to 1.0
      const total = res.adverseSelectionShare + res.orderProcessingShare + res.inventoryHoldingShare;
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('throws when observation sample size is insufficient', () => {
      expect(() => HuangStollEngine.decomposeSpread([])).toThrow();
    });
  });
});
