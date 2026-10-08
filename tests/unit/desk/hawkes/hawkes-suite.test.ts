import { describe, it, expect } from 'vitest';
import { MultivariateHawkesIntensityEstimator } from '../../../../src/desk/hawkes/multivariate-hawkes-intensity-estimator';
import { BranchingRatioStabilityAnalyzer } from '../../../../src/desk/hawkes/branching-ratio-stability-analyzer';
import {
  HawkesEvent,
  HawkesKernelParams,
} from '../../../../src/desk/hawkes/hawkes-types';

describe('High-Frequency Limit Order Book Hawkes Desk Suite', () => {
  describe('MultivariateHawkesIntensityEstimator', () => {
    it('computes self-exciting conditional intensity from clustered event stream', () => {
      const estimator = new MultivariateHawkesIntensityEstimator();

      const events: HawkesEvent[] = [
        { timestampSeconds: 10.1, eventType: 'AGGRESSIVE_BUY', size: 100 },
        { timestampSeconds: 10.2, eventType: 'AGGRESSIVE_BUY', size: 150 },
        { timestampSeconds: 10.25, eventType: 'LIMIT_BID', size: 500 },
      ];

      const params: HawkesKernelParams = {
        baselineIntensityMu: 1.2,
        alphaExcitations: [0.8],
        betaDecays: [2.5],
      };

      const res = estimator.computeIntensity(10.3, events, params);

      expect(res.totalConditionalIntensity).toBeGreaterThan(1.2); // Intensified by clustering
      expect(res.endogenousSharePct).toBeGreaterThan(0);
      expect(res.exogenousSharePct + res.endogenousSharePct).toBeCloseTo(100.0, 1);
    });
  });

  describe('BranchingRatioStabilityAnalyzer', () => {
    it('analyzes branching ratio and proves stability under sub-critical regime', () => {
      const analyzer = new BranchingRatioStabilityAnalyzer();

      const alpha = [
        [0.4, 0.1],
        [0.1, 0.4],
      ];
      const beta = [
        [1.0, 1.0],
        [1.0, 1.0],
      ];

      const res = analyzer.analyzeStability(alpha, beta);

      // Gamma = [[0.4, 0.1], [0.1, 0.4]], dominant eigenvalue = 0.5
      expect(res.spectralRadius).toBeCloseTo(0.5, 2);
      expect(res.isSystemStable).toBe(true);
      expect(res.reflexivityRegime).toBe('SUB_CRITICAL');
    });

    it('detects near-critical or super-critical regimes', () => {
      const analyzer = new BranchingRatioStabilityAnalyzer();

      const alpha = [
        [0.9, 0.2],
        [0.2, 0.9],
      ];
      const beta = [
        [1.0, 1.0],
        [1.0, 1.0],
      ];

      const res = analyzer.analyzeStability(alpha, beta);
      // Dominant eigenvalue = 1.1 >= 1.0
      expect(res.spectralRadius).toBeGreaterThanOrEqual(1.0);
      expect(res.isSystemStable).toBe(false);
      expect(res.reflexivityRegime).toBe('SUPER_CRITICAL');
    });
  });
});
