import { describe, it, expect } from 'vitest';
import { LeadLagAlphaPredictor } from '../../../../src/desk/signal/lead-lag-alpha-predictor';
import { InventorySkewQuoter } from '../../../../src/desk/strategies/inventory-skew-quoter';
import { BinaryRiskParityOptimizer } from '../../../../src/desk/portfolio/binary-risk-parity-optimizer';

describe('Quantitative Alpha Trilogy', () => {
  describe('LeadLagAlphaPredictor', () => {
    const predictor = new LeadLagAlphaPredictor({ minObservations: 3 });

    it('calculates Hayashi-Yoshida cross-correlation and predicts alpha drift', () => {
      // Feed lead venue ticks
      predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60000, timestampMs: 1000 });
      predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60300, timestampMs: 2000 });
      predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60600, timestampMs: 3000 });

      // Feed lag venue ticks
      predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.50, timestampMs: 1050 });
      predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.51, timestampMs: 2050 });
      predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.52, timestampMs: 3050 });

      const signal = predictor.predictAlpha('Binance', 'Polymarket', 'BTC', 3100);
      expect(signal.leadVenue).toBe('Binance');
      expect(signal.lagVenue).toBe('Polymarket');
      expect(signal.crossCorrelation).toBeGreaterThan(0.8);
      expect(signal.jumpIntensity).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('InventorySkewQuoter', () => {
    const quoter = new InventorySkewQuoter({
      riskAversionGamma: 0.2,
      maxAbsInventory: 2000,
      baseOrderSize: 100,
    });

    it('skews reservation price and order sizes to de-risk inventory', () => {
      const flatQuotes = quoter.generateTwoWayQuotes({
        marketId: 'presidential-2028',
        midPrice: 0.50,
        netInventory: 0,
        timeToExpirySec: 86400 * 30,
      });

      expect(flatQuotes.reservationPrice).toBeCloseTo(0.50, 2);
      expect(flatQuotes.bidSize).toBe(100);
      expect(flatQuotes.askSize).toBe(100);

      const longQuotes = quoter.generateTwoWayQuotes({
        marketId: 'presidential-2028',
        midPrice: 0.50,
        netInventory: 1000, // Long 1000 contracts
        timeToExpirySec: 86400 * 30,
      });

      // Long inventory should lower reservation price and reduce bid size
      expect(longQuotes.reservationPrice).toBeLessThan(flatQuotes.reservationPrice);
      expect(longQuotes.bidSize).toBeLessThan(flatQuotes.bidSize);
      expect(longQuotes.askSize).toBeGreaterThan(flatQuotes.askSize);
    });
  });

  describe('BinaryRiskParityOptimizer', () => {
    const optimizer = new BinaryRiskParityOptimizer();

    it('optimizes risk parity weights and provides CVaR metrics', () => {
      const assets = [
        { symbol: 'm1', currentPrice: 0.50, expectedReturnBps: 200, estimatedVolatility: 0.20 },
        { symbol: 'm2', currentPrice: 0.40, expectedReturnBps: 150, estimatedVolatility: 0.40 },
      ];
      // Diagonal covariance matrix
      const cov = [
        [0.04, 0.0],
        [0.0, 0.16],
      ];

      const allocation = optimizer.optimizeAllocation(assets, cov, 100000, {
        maxPortfolioVolatility: 0.25,
        cvarConfidenceLevel: 0.95,
        maxSingleAssetWeight: 0.8,
      });

      expect(allocation.weights['m1']).toBeGreaterThan(allocation.weights['m2']!);
      expect(allocation.weights['m1']! + allocation.weights['m2']!).toBeCloseTo(1.0, 2);
      expect(allocation.parametricVaR95Usd).toBeGreaterThan(0);
      expect(allocation.cvar95Usd).toBeGreaterThanOrEqual(allocation.parametricVaR95Usd);
      expect(allocation.diversificationRatio).toBeGreaterThan(1.0);
    });

    it('enforces strict asset weight caps without inflating already capped assets', () => {
      const assets = [
        { symbol: 'low-vol', currentPrice: 0.50, expectedReturnBps: 100, estimatedVolatility: 0.05, maxWeightLimit: 0.40 },
        { symbol: 'mid-vol', currentPrice: 0.50, expectedReturnBps: 100, estimatedVolatility: 0.20 },
        { symbol: 'high-vol', currentPrice: 0.50, expectedReturnBps: 100, estimatedVolatility: 0.50 },
      ];
      const cov = [
        [0.0025, 0, 0],
        [0, 0.04, 0],
        [0, 0, 0.25],
      ];

      const allocation = optimizer.optimizeAllocation(assets, cov, 100000, {
        maxPortfolioVolatility: 0.20,
        cvarConfidenceLevel: 0.95,
        maxSingleAssetWeight: 0.50,
      });

      // low-vol initial weight would be >0.70 due to low volatility, but must be capped strictly at 0.40
      expect(allocation.weights['low-vol']).toBeLessThanOrEqual(0.4001);
      const totalWeight = Object.values(allocation.weights).reduce((s, w) => s + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });
  });
});
