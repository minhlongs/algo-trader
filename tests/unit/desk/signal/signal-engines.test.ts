import { describe, it, expect } from 'vitest';
import { BayesianMarketBeliefUpdater } from '../../../../src/desk/signal/bayesian-belief-updater';
import { OrderBookPressureIndicator } from '../../../../src/desk/signal/orderbook-pressure-indicator';
import { CrossVenueCorrelationMatrix } from '../../../../src/desk/signal/cross-venue-correlation-matrix';

describe('Quantitative Signal Trilogy', () => {
  describe('BayesianMarketBeliefUpdater', () => {
    const updater = new BayesianMarketBeliefUpdater();

    it('updates Beta prior to posterior incorporating poll data', () => {
      // Prior: alpha=10, beta=10 (mean = 0.50)
      const res = updater.updateBelief(
        'market-us-election',
        { alpha: 10, beta: 10 },
        [
          {
            pollId: 'poll-1',
            sampleSize: 100,
            observedShare: 0.60,
            pollsterCredibilityWeight: 1.0,
          },
        ]
      );

      // Posterior alpha = 10 + 60 = 70, beta = 10 + 40 = 50
      expect(res.posterior.alpha).toBe(70);
      expect(res.posterior.beta).toBe(50);
      expect(res.posteriorMean).toBeCloseTo(70 / 120, 3);
      expect(res.credibleInterval95[0]).toBeGreaterThan(0.48);
      expect(res.credibleInterval95[1]).toBeLessThan(0.68);
    });
  });

  describe('OrderBookPressureIndicator', () => {
    const indicator = new OrderBookPressureIndicator(3, 0.5);

    it('detects strong bid pressure when bid volume heavily exceeds ask volume', () => {
      const metrics = indicator.calculatePressure({
        marketId: 'm-btc-100k',
        timestamp: Date.now(),
        bids: [
          { price: 0.60, quantity: 10000 },
          { price: 0.59, quantity: 8000 },
          { price: 0.58, quantity: 5000 },
        ],
        asks: [
          { price: 0.61, quantity: 1000 },
          { price: 0.62, quantity: 1200 },
          { price: 0.63, quantity: 1500 },
        ],
      });

      expect(metrics.microPrice).toBeGreaterThan(metrics.midPrice);
      expect(metrics.regime).toBe('STRONG_BID_PRESSURE');
      expect(metrics.topLevelImbalance).toBeGreaterThan(0.8);
      expect(metrics.expectedTickDriftBps).toBeGreaterThan(10);
    });
  });

  describe('CrossVenueCorrelationMatrix', () => {
    const matrixCalc = new CrossVenueCorrelationMatrix(10);

    it('computes rolling correlation between co-moving assets', () => {
      // Asset A and B move in lockstep, C moves inversely
      matrixCalc.addObservation({ timestamp: 1, pricesBySymbol: { A: 10, B: 20, C: 100 } });
      matrixCalc.addObservation({ timestamp: 2, pricesBySymbol: { A: 11, B: 22, C: 90 } });
      matrixCalc.addObservation({ timestamp: 3, pricesBySymbol: { A: 12, B: 24, C: 80 } });
      matrixCalc.addObservation({ timestamp: 4, pricesBySymbol: { A: 11.5, B: 23, C: 85 } });

      const corr = matrixCalc.computeCorrelation(['A', 'B', 'C']);
      expect(corr.symbols).toEqual(['A', 'B', 'C']);
      // Corr(A, B) should be near 1.0 (perfect correlation)
      expect(corr.matrix[0]![1]).toBeGreaterThan(0.95);
      // Corr(A, C) should be strongly negative (inverse correlation)
      expect(corr.matrix[0]![2]).toBeLessThan(-0.95);
    });
  });
});
