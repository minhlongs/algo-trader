import { describe, it, expect } from 'vitest';
import { RollSpreadEstimator } from '../../../../src/desk/microstructure/roll-spread-estimator';
import { HasbrouckInformationShareCalculator } from '../../../../src/desk/microstructure/hasbrouck-information-share';
import { MultiLevelMicroPriceEstimator } from '../../../../src/desk/microstructure/multi-level-micro-price';

describe('Microstructure Signal Synthesizer Suite', () => {
  describe('RollSpreadEstimator', () => {
    it('calculates implicit effective bid-ask spread from serial price bounce', () => {
      const estimator = new RollSpreadEstimator();

      // Bouncing prices between bid and ask (bid bounce)
      const prices = [100.0, 100.5, 100.0, 100.5, 100.0, 100.5, 100.0, 100.5];
      prices.forEach((p) => estimator.ingestPrice(p));

      const res = estimator.estimateSpread('BTC/USD');
      expect(res.autocovariance).toBeLessThan(0);
      expect(res.effectiveSpread).toBeGreaterThan(0.3);
      expect(res.effectiveSpreadBps).toBeGreaterThan(30);
    });
  });

  describe('HasbrouckInformationShareCalculator', () => {
    it('decomposes common permanent price innovation between leading and following venues', () => {
      const calc = new HasbrouckInformationShareCalculator();

      const share = calc.calculateShare('Binance', 'Coinbase', 0.0004, 0.0002, 0.00015);
      expect(share.leadVenue).toBe('Binance');
      expect(share.followVenue).toBe('Coinbase');
      expect(share.leadInformationSharePct).toBeGreaterThan(50);
      expect(share.followInformationSharePct).toBeLessThan(50);
      expect(share.leadInformationSharePct + share.followInformationSharePct).toBeCloseTo(100, 1);
    });
  });

  describe('MultiLevelMicroPriceEstimator', () => {
    it('calculates fair micro-price adjusted for depth queue imbalance', () => {
      const estimator = new MultiLevelMicroPriceEstimator();

      const book = {
        symbol: 'ETH/USD',
        bids: [
          { price: 3000.0, size: 25 },
          { price: 2999.5, size: 50 },
        ],
        asks: [
          { price: 3001.0, size: 5 },
          { price: 3001.5, size: 10 },
        ],
        timestampMs: 1000,
      };

      const estimate = estimator.estimateMicroPrice(book);
      expect(estimate).toBeDefined();
      expect(estimate?.midPrice).toBe(3000.5);
      // Heavy bid book pulls micro-price above mid towards the ask
      expect(estimate?.microPrice).toBeGreaterThan(3000.5);
      expect(estimate?.queueImbalance).toBeGreaterThan(0.5);
      expect(estimate?.spreadBps).toBeCloseTo(3.33, 1);
    });
  });
});
