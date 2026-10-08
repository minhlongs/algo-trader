import { describe, it, expect } from 'vitest';
import { EngleGrangerAnalyzer } from '../../../../src/desk/cointegration/engle-granger-analyzer';
import { OrnsteinUhlenbeckEstimator } from '../../../../src/desk/cointegration/ornstein-uhlenbeck-estimator';
import { PricePairSeries } from '../../../../src/desk/cointegration/cointegration-types';

describe('Cointegration & Statistical Convergence Desk Suite', () => {
  describe('EngleGrangerAnalyzer', () => {
    it('detects cointegrated stationary residual relationship', () => {
      const analyzer = new EngleGrangerAnalyzer();

      // Synthesize cointegrated series Y = 10 + 1.5 * X + stationary_noise
      const N = 80;
      const pricesX: number[] = [];
      const pricesY: number[] = [];
      let x = 100;
      let noise = 0;

      for (let i = 0; i < N; i++) {
        x += (Math.sin(i * 0.2) + 0.5);
        noise = 0.4 * noise + Math.cos(i * 0.8) * 0.5; // stationary AR(1)
        pricesX.push(x);
        pricesY.push(10 + 1.5 * x + noise);
      }

      const pair: PricePairSeries = {
        assetY: 'GLD',
        assetX: 'SLV',
        pricesY,
        pricesX,
      };

      const res = analyzer.analyzePair(pair);

      expect(res.hedgeRatioBeta).toBeCloseTo(1.5, 1);
      expect(res.rSquared).toBeGreaterThan(0.90);
      expect(res.adfTestStatistic).toBeLessThan(-2.5);
      expect(res.residuals.length).toBe(N);
    });
  });

  describe('OrnsteinUhlenbeckEstimator', () => {
    it('estimates mean-reversion speed theta and half-life days', () => {
      const estimator = new OrnsteinUhlenbeckEstimator();

      // Spread with mean reversion towards 0
      const spread = [2.5, 2.0, 1.6, 1.2, 0.9, 0.7, 0.5, 0.3, 0.2, 0.1, -0.1, -0.3, 0.1, 0.0, -0.2, 0.1, 0.0];
      const res = estimator.estimateParameters(spread, 1.0);

      expect(res.thetaMeanReversionSpeed).toBeGreaterThan(0);
      expect(res.halfLifeDays).toBeGreaterThan(0);
      expect(res.tradeSignal).toBeDefined();
    });
  });
});
