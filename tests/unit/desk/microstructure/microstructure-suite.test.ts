import { describe, it, expect } from 'vitest';
import { VpinToxicityEstimator } from '../../../../src/desk/microstructure/vpin-toxicity-estimator';
import { OrderFlowImbalanceEngine } from '../../../../src/desk/microstructure/order-flow-imbalance-engine';
import { TradeExecution, Level2OrderBook } from '../../../../src/desk/microstructure/microstructure-types';

describe('L2 Microstructure Order Flow Desk Suite', () => {
  describe('VpinToxicityEstimator', () => {
    it('computes volume-synchronized toxicity metric over trade stream', () => {
      const estimator = new VpinToxicityEstimator();

      // Synthetic trades with alternating buys and aggressive seller burst
      const trades: TradeExecution[] = [];
      let price = 100.0;
      for (let i = 0; i < 40; i++) {
        // Drop price systematically -> high toxicity sell flow
        price -= 0.05;
        trades.push({ price, size: 250, timestampMs: 1000 + i * 100 });
      }

      const res = estimator.computeVpin(trades, 500, 10);

      expect(res.vpin).toBeGreaterThan(0.5); // Sell burst triggers high toxicity
      expect(['HIGH', 'CRITICAL']).toContain(res.toxicityRegime);
      expect(res.bucketCount).toBeGreaterThan(0);
    });

    it('throws error when volume is insufficient for a single bucket', () => {
      const estimator = new VpinToxicityEstimator();
      const trades = [
        { price: 100, size: 10, timestampMs: 1000 },
        { price: 100.1, size: 10, timestampMs: 2000 },
      ];
      expect(() => estimator.computeVpin(trades, 1000)).toThrow('Insufficient volume');
    });
  });

  describe('OrderFlowImbalanceEngine', () => {
    it('computes OFI on price improvement and signals depletion alert', () => {
      const engine = new OrderFlowImbalanceEngine();

      const prevBook: Level2OrderBook = {
        timestampMs: 1000,
        bids: [{ price: 100.0, size: 500 }, { price: 99.95, size: 1000 }],
        asks: [{ price: 100.05, size: 600 }, { price: 100.1, size: 800 }],
      };

      // Aggressive bid lift: Best bid moves up with size 400
      const currBook: Level2OrderBook = {
        timestampMs: 1010,
        bids: [{ price: 100.02, size: 400 }, { price: 100.0, size: 500 }],
        asks: [{ price: 100.05, size: 100 }, { price: 100.1, size: 800 }], // Ask size depleted from 600 to 100
      };

      const signal = engine.computeOfi(prevBook, currBook);

      expect(signal.ofiContracts).toBeGreaterThan(0); // Net positive buying pressure
      expect(signal.depletionAlert).toBe(true); // Ask depleted by > 75%
      expect(signal.bestBidPrice).toBe(100.02);
      expect(signal.bestAskPrice).toBe(100.05);
      expect(signal.spread).toBeCloseTo(0.03, 2);
    });
  });
});
