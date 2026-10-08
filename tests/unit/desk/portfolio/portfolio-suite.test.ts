import { describe, it, expect } from 'vitest';
import { LedoitWolfCovarianceEstimator } from '../../../../src/desk/portfolio/ledoit-wolf-covariance-estimator';
import { RiskParityOptimizer } from '../../../../src/desk/portfolio/risk-parity-optimizer';
import { FactorRiskAttributionEngine } from '../../../../src/desk/portfolio/factor-risk-attribution-engine';

describe('Equity Multi-Factor Portfolio Desk Suite', () => {
  describe('LedoitWolfCovarianceEstimator', () => {
    it('estimates shrunk covariance matrix with analytical shrinkage intensity', () => {
      const estimator = new LedoitWolfCovarianceEstimator();

      // Synthetic returns for 3 assets over 10 periods
      const returns = [
        [0.01, -0.02, 0.03, -0.01, 0.02, 0.015, -0.005, 0.02, -0.01, 0.03],
        [0.012, -0.018, 0.028, -0.008, 0.022, 0.014, -0.004, 0.018, -0.009, 0.026],
        [-0.01, 0.02, -0.015, 0.025, -0.01, -0.005, 0.03, -0.012, 0.015, -0.02],
      ];

      const res = estimator.estimateCovariance(returns);

      expect(res.shrunkCovariance.length).toBe(3);
      expect(res.shrunkCovariance[0]!.length).toBe(3);
      expect(res.shrinkageIntensity).toBeGreaterThanOrEqual(0);
      expect(res.shrinkageIntensity).toBeLessThanOrEqual(1);
      expect(res.shrunkCovariance[0]![0]!).toBeGreaterThan(0);
    });
  });

  describe('RiskParityOptimizer', () => {
    it('optimizes portfolio weights to equalize risk contributions across assets', () => {
      const optimizer = new RiskParityOptimizer();

      // Sample covariance matrix for 3 assets with varying variances
      const cov = [
        [0.04, 0.01, 0.0],
        [0.01, 0.09, 0.02],
        [0.0, 0.02, 0.16],
      ];

      const res = optimizer.optimizeEqualRiskContribution(cov);

      expect(res.converged).toBe(true);
      expect(res.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 4);

      // Asset 1 (lowest variance) must receive the highest weight in risk parity
      expect(res.weights[0]!).toBeGreaterThan(res.weights[1]!);
      expect(res.weights[1]!).toBeGreaterThan(res.weights[2]!);

      // Risk disparity across all 3 assets should be minimal
      expect(res.maxDisparityPct).toBeLessThan(0.1);
    });
  });

  describe('FactorRiskAttributionEngine', () => {
    it('decomposes total portfolio active risk into factor and specific risk', () => {
      const engine = new FactorRiskAttributionEngine();

      const weights = [0.6, 0.4];
      const exposures = [
        { symbol: 'AAPL', factorBeta: { MOMENTUM: 1.2, VALUE: -0.4 } },
        { symbol: 'JPM', factorBeta: { MOMENTUM: -0.2, VALUE: 1.1 } },
      ];
      const factorCov = {
        MOMENTUM: { MOMENTUM: 0.04, VALUE: -0.01 },
        VALUE: { MOMENTUM: -0.01, VALUE: 0.03 },
      };
      const specificVar = [0.015, 0.02];

      const res = engine.attributeRisk(weights, exposures, factorCov, specificVar);

      expect(res.totalVariancePct).toBeGreaterThan(0);
      expect(res.specificRiskPct).toBeGreaterThan(0);
      expect(res.factorRiskContributionPct.MOMENTUM).toBeDefined();
      expect(res.factorRiskContributionPct.VALUE).toBeDefined();
    });
  });
});
