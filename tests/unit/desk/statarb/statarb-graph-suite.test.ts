import { describe, it, expect } from 'vitest';
import { OrnsteinUhlenbeckCalibrator } from '../../../../src/desk/statarb/ornstein-uhlenbeck-calibrator';
import { CointegrationGraphEngine } from '../../../../src/desk/statarb/cointegration-graph-engine';
import { PairTradingSignalGenerator } from '../../../../src/desk/statarb/pair-trading-signal-generator';

describe('Statistical Arbitrage Graph Desk Suite', () => {
  describe('OrnsteinUhlenbeckCalibrator', () => {
    it('calibrates mean reversion speed theta, long term mean and half-life', () => {
      const calibrator = new OrnsteinUhlenbeckCalibrator();

      // Synthetic mean-reverting series around mu = 5.0
      const spread: number[] = [5.0];
      const trueTheta = 0.5;
      const trueMu = 5.0;

      for (let i = 0; i < 50; i++) {
        const prev = spread[i]!;
        const next = prev + trueTheta * (trueMu - prev) * 0.2 + (Math.sin(i) * 0.1);
        spread.push(next);
      }

      const params = calibrator.calibrate(spread, 0.2);

      expect(params.theta).toBeGreaterThan(0);
      expect(params.halfLifePeriods).toBeGreaterThan(0);
      expect(params.mu).toBeCloseTo(5.0, 0);
      expect(params.equilibriumVariance).toBeGreaterThan(0);
    });

    it('rejects series with fewer than 5 observations', () => {
      const calibrator = new OrnsteinUhlenbeckCalibrator();
      expect(() => calibrator.calibrate([1, 2, 3])).toThrow('at least 5 observations');
    });
  });

  describe('CointegrationGraphEngine', () => {
    it('estimates hedge ratio and constructs cointegration residual spread', () => {
      const engine = new CointegrationGraphEngine();

      const pricesB = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      // pricesA = 10 + 1.5 * pricesB + noise
      const pricesA = pricesB.map((b, i) => 10 + 1.5 * b + (i % 2 === 0 ? 0.5 : -0.5));

      const res = engine.analyzePair({
        symbolA: 'MSFT',
        symbolB: 'GOOGL',
        pricesA,
        pricesB,
      });

      expect(res.hedgeRatio).toBeCloseTo(1.5, 1);
      expect(res.residualSpread.length).toBe(30);
      expect(res.isCointegrated).toBe(true);
    });

    it('computes Minimum Spanning Tree across multi-asset returns', () => {
      const engine = new CointegrationGraphEngine();

      const returns = {
        AAPL: [0.01, -0.02, 0.015, 0.03, -0.01],
        MSFT: [0.012, -0.018, 0.014, 0.028, -0.008], // Highly correlated with AAPL
        XOM: [-0.01, 0.02, -0.005, -0.01, 0.02], // Energy, low/negative correlation
      };

      const mst = engine.computeMinimumSpanningTree(returns);

      expect(mst.length).toBe(2); // 3 assets -> 2 edges in tree
      const symbols = new Set(mst.flatMap(e => [e.source, e.target]));
      expect(symbols.size).toBe(3);
    });
  });

  describe('PairTradingSignalGenerator', () => {
    it('triggers short spread signal when z-score exceeds entry threshold', () => {
      const generator = new PairTradingSignalGenerator(2.0, 0.5, 3.5);

      const ouParams = {
        theta: 0.5,
        mu: 0.0,
        sigma: 1.0,
        halfLifePeriods: 1.38,
        equilibriumVariance: 1.0, // stdDev = 1.0
      };

      const signal = generator.generateSignal(1, 2.5, 1.2, ouParams);

      expect(signal.action).toBe('SHORT_SPREAD');
      expect(signal.zScore).toBe(2.5);
      expect(signal.targetWeightA).toBe(-1.0);
      expect(signal.targetWeightB).toBe(1.2);
    });

    it('triggers stop loss when spread deviates beyond stop threshold', () => {
      const generator = new PairTradingSignalGenerator(2.0, 0.5, 3.5);

      const ouParams = {
        theta: 0.5,
        mu: 0.0,
        sigma: 1.0,
        halfLifePeriods: 1.38,
        equilibriumVariance: 1.0,
      };

      const signal = generator.generateSignal(1, 4.0, 1.2, ouParams);
      expect(signal.action).toBe('STOP_LOSS');
    });
  });
});
