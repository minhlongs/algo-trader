import { describe, it, expect } from 'vitest';
import { LsbEngine } from '../../../../src/desk/lsb/lsb-engine.js';
import { LsbMath } from '../../../../src/desk/lsb/lsb-math.js';
import { LsbTradeObservation } from '../../../../src/desk/lsb/lsb-types.js';

describe('Lin-Sanger-Booth (1995) Spread Decomposition Suite', () => {
  describe('LsbMath', () => {
    it('estimates OLS slope accurately', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      const slope = LsbMath.olsSlope(x, y, true);
      expect(slope).toBeCloseTo(2.0, 4);
    });
  });

  describe('LsbEngine Decomposition', () => {
    it('throws error when observations are fewer than 10', () => {
      const fewObs: LsbTradeObservation[] = [
        { tradePrice: 100, bid: 99.5, ask: 100.5 },
      ];
      expect(() => LsbEngine.decomposeSpread({ observations: fewObs })).toThrow();
    });

    it('decomposes spread into fractions that sum exactly to 1.0', () => {
      const obs: LsbTradeObservation[] = [];
      let mid = 100.0;
      const halfSpread = 0.5;

      for (let i = 0; i < 40; i++) {
        // Trade occurs against prevailing quotes
        const sign = i % 4 < 2 ? 1 : -1; // Positive autocorrelation (persistence)
        const tradePrice = mid + sign * halfSpread;
        obs.push({
          tradePrice,
          bid: mid - halfSpread,
          ask: mid + halfSpread,
        });

        // Next quote updates in direction of current trade (information content)
        mid += sign * 0.15;
      }

      const res = LsbEngine.decomposeSpread({ observations: obs });
      expect(res.sampleSize).toBe(40);
      expect(res.quotedSpread).toBeCloseTo(1.0, 4);
      expect(res.adverseSelectionFraction).toBeGreaterThan(0);
      expect(res.orderProcessingFraction).toBeGreaterThan(0);
      expect(
        res.adverseSelectionFraction + res.orderProcessingFraction + res.inventoryHoldingFraction
      ).toBeCloseTo(1.0, 4);
    });
  });
});
