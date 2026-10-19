import { describe, it, expect } from 'vitest';
import { GknEngine } from '../../../../src/desk/gkn/gkn-engine.js';
import { GknMath } from '../../../../src/desk/gkn/gkn-math.js';
import { GknObservation } from '../../../../src/desk/gkn/gkn-types.js';

describe('George-Kaul-Nimalendran (1991) Spread Decomposition Suite', () => {
  describe('GknMath', () => {
    it('computes mean accurately', () => {
      const data = [1.0, 2.0, 3.0, 4.0, 5.0];
      expect(GknMath.mean(data)).toBe(3.0);
    });

    it('computes autocovariance at lag 1 with bid-ask bounce alternation', () => {
      const alternating = [1, -1, 1, -1, 1, -1, 1, -1];
      const cov = GknMath.autocovariance(alternating, 1);
      expect(cov).toBeLessThan(0);
    });
  });

  describe('GknEngine Decomposition', () => {
    it('throws error when observations are fewer than 10', () => {
      const shortObs: GknObservation[] = [
        { tradePrice: 100, bid: 99.5, ask: 100.5 },
        { tradePrice: 100.5, bid: 99.5, ask: 100.5 },
      ];
      expect(() => GknEngine.decomposeSpread({ observations: shortObs })).toThrow();
    });

    it('decomposes spread under alternating buy/sell order processing bounce', () => {
      const obs: GknObservation[] = [];
      const mid = 100.0;
      const halfSpread = 0.5;

      for (let i = 0; i < 40; i++) {
        // Pure bid-ask bounce: alternating buys (+halfSpread) and sells (-halfSpread)
        const sign = i % 2 === 0 ? 1 : -1;
        const tradePrice = mid + sign * halfSpread;
        obs.push({
          tradePrice,
          bid: mid - halfSpread,
          ask: mid + halfSpread,
        });
      }

      const res = GknEngine.decomposeSpread({ observations: obs });
      expect(res.sampleSize).toBe(40);
      expect(res.quotedSpread).toBeCloseTo(1.0, 4);
      expect(res.orderProcessingFraction).toBeGreaterThan(0.5);
      expect(res.adverseSelectionFraction).toBeLessThan(0.5);
      expect(res.orderProcessingFraction + res.adverseSelectionFraction).toBeCloseTo(1.0, 4);
    });

    it('handles neutral random walk order flow gracefully', () => {
      const obs: GknObservation[] = [];
      let currentPrice = 100.0;

      for (let i = 0; i < 20; i++) {
        currentPrice += 0.05; // monotonic drift, positive autocorrelation
        obs.push({
          tradePrice: currentPrice,
          bid: currentPrice - 0.25,
          ask: currentPrice + 0.25,
        });
      }

      const res = GknEngine.decomposeSpread({ observations: obs });
      expect(res.quotedSpread).toBeCloseTo(0.5, 4);
      expect(res.orderProcessingFraction).toBe(0.5);
      expect(res.adverseSelectionFraction).toBe(0.5);
    });
  });
});
