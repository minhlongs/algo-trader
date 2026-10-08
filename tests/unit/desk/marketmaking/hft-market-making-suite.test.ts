import { describe, it, expect } from 'vitest';
import { HawkesIntensityEstimator } from '../../../../src/desk/marketmaking/hawkes-intensity-estimator';
import { InventorySkewQuoteEngine } from '../../../../src/desk/marketmaking/inventory-skew-quote-engine';
import { AdverseSelectionPredictor } from '../../../../src/desk/marketmaking/adverse-selection-predictor';

describe('High-Frequency Market Making & Hawkes Toxicity Suite', () => {
  describe('HawkesIntensityEstimator', () => {
    it('models self-excitation jumps, exponential decay, and detects flow toxicity', () => {
      const estimator = new HawkesIntensityEstimator({
        baselineMu: 1.0,
        alphaSelf: 1.5,
        alphaCross: 0.2,
        betaDecay: 1.0, // halves over ~0.69s
      });

      // Initial baseline check
      const snap0 = estimator.getIntensitySnapshot(1000);
      expect(snap0.buyIntensity).toBe(1.0);
      expect(snap0.sellIntensity).toBe(1.0);
      expect(snap0.toxicityLevel).toBe('LOW');

      // Cluster of 4 rapid buy trades within 100ms
      for (let i = 0; i < 4; i++) {
        estimator.recordTrade({
          tradeId: `t-${i}`,
          symbol: 'BTC/USD',
          timestampMs: 1000 + i * 25,
          side: 'BUY',
          size: 1.5,
          price: 65000,
        });
      }

      const snapClustered = estimator.getIntensitySnapshot(1100);
      expect(snapClustered.buyIntensity).toBeGreaterThan(5.0);
      expect(snapClustered.crossExcitationRatio).toBeGreaterThan(0.5);
      expect(['HIGH', 'CRITICAL']).toContain(snapClustered.toxicityLevel);

      // Advance time by 5 seconds (decay)
      const snapDecayed = estimator.getIntensitySnapshot(6100);
      expect(snapDecayed.buyIntensity).toBeLessThan(1.5);
      expect(snapDecayed.toxicityLevel).toBe('LOW');
    });
  });

  describe('InventorySkewQuoteEngine', () => {
    it('shifts reservation price and skews asymmetric bid/ask quotes based on inventory', () => {
      const engine = new InventorySkewQuoteEngine({
        riskAversionGamma: 0.1,
        orderArrivalA: 140,
        orderIntensityK: 1.5,
        assetVolatilitySigma: 0.05,
        terminalHorizonSec: 60,
      });

      const midpoint = 100.0;

      // Flat inventory (q = 0)
      const flatQuote = engine.calculateQuotes(midpoint, 0);
      expect(flatQuote.reservationPrice).toBe(100.0);
      expect(flatQuote.optimalBid).toBeLessThan(100.0);
      expect(flatQuote.optimalAsk).toBeGreaterThan(100.0);
      expect(flatQuote.bidSpread).toBeCloseTo(flatQuote.askSpread, 2);

      // Long inventory (q = +10) -> Must lower quotes to shed inventory
      const longQuote = engine.calculateQuotes(midpoint, 10);
      expect(longQuote.reservationPrice).toBeLessThan(midpoint);
      expect(longQuote.optimalBid).toBeLessThan(flatQuote.optimalBid);
      expect(longQuote.optimalAsk).toBeLessThan(flatQuote.optimalAsk);

      // Short inventory (q = -10) -> Must raise quotes to acquire inventory
      const shortQuote = engine.calculateQuotes(midpoint, -10);
      expect(shortQuote.reservationPrice).toBeGreaterThan(midpoint);
      expect(shortQuote.optimalBid).toBeGreaterThan(flatQuote.optimalBid);
      expect(shortQuote.optimalAsk).toBeGreaterThan(flatQuote.optimalAsk);
    });
  });

  describe('AdverseSelectionPredictor', () => {
    it('evaluates post-trade price markout drift and computes toxic flow ratio', () => {
      const predictor = new AdverseSelectionPredictor(3.0, 100);

      // MM sells to informed buyer, price jumps up by 5 bps (toxic trade)
      const trade1 = predictor.evaluateMarkout('tr-1', 'BUY', 50000, 50010, 50025, 50050);
      expect(trade1.shortHorizonLossBps).toBe(5.0);
      expect(trade1.isToxicFlow).toBe(true);

      // MM sells to uninformed buyer, price drifts down by 2 bps (benign trade)
      const trade2 = predictor.evaluateMarkout('tr-2', 'BUY', 50000, 49995, 49990, 49980);
      expect(trade2.shortHorizonLossBps).toBe(-2.0);
      expect(trade2.isToxicFlow).toBe(false);

      // MM buys from informed seller, price plunges down by 4 bps (toxic trade)
      const trade3 = predictor.evaluateMarkout('tr-3', 'SELL', 50000, 49990, 49980, 49950);
      expect(trade3.shortHorizonLossBps).toBe(4.0);
      expect(trade3.isToxicFlow).toBe(true);

      expect(predictor.getHistoryCount()).toBe(3);
      // 2 out of 3 trades are toxic
      expect(predictor.getToxicFlowRatio()).toBeCloseTo(0.6667, 3);
      // Average loss: (5 - 2 + 4) / 3 = 7 / 3 = 2.33 bps
      expect(predictor.getAverageMarkoutLossBps()).toBe(2.33);
    });
  });
});
