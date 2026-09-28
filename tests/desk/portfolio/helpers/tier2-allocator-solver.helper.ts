import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  RollingCovarianceEstimator,
  ErcParitySolver,
  solveErcCcd,
} from '../../../../src/desk/portfolio';

export function registerTier2AllocatorSolverTests(): void {
  describe('Tier 2: Boundary - Feature 1: ERC Risk Parity Solver (F1)', () => {
    it('B1.1: near-zero diagonal variances (1e-8) converge with ridge stabilization', () => {
      const sigma = [[1e-8, 0, 0, 0], [0, 1e-8, 0, 0], [0, 0, 1e-8, 0], [0, 0, 0, 1e-8]];
      const res = solveErcCcd(sigma, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
      expect(res.converged).toBe(true);
      res.weights.forEach((w) => expect(w).toBeCloseTo(0.25, 3));
    });

    it('B1.2: identical covariance values produce exactly equal weights (0.25)', () => {
      const sigma = [[0.04, 0.01, 0.01, 0.01], [0.01, 0.04, 0.01, 0.01], [0.01, 0.01, 0.04, 0.01], [0.01, 0.01, 0.01, 0.04]];
      const res = solveErcCcd(sigma, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
      res.weights.forEach((w) => expect(w).toBeCloseTo(0.25, 4));
    });

    it('B1.3: extreme budget skew (97% vs 1%) allocates dominant weight to target', () => {
      const sigma = [[0.01, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]];
      const res = solveErcCcd(sigma, [0.97, 0.01, 0.01, 0.01], 1e-4, 25);
      expect(res.weights[0]).toBeGreaterThan(0.70);
    });

    it('B1.4: 1 asset with 100x higher variance receives dramatically throttled weight', () => {
      const sigma = [[1.00, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]];
      const solver = new ErcParitySolver();
      const cov = { engines: [...ENGINE_IDS], matrix: sigma, observations: 20, lastUpdated: 0, isConditioned: true };
      const res = solver.solve(cov);
      expect(res.weights.arbitrage).toBeLessThan(res.weights.marl / 5);
    });

    it('B1.5: maxIterations=1 does not crash and produces valid bounded weights summing to 1.0', () => {
      const sigma = [[0.04, 0.01, 0, 0], [0.01, 0.04, 0, 0], [0, 0, 0.04, 0.01], [0, 0, 0.01, 0.04]];
      const res = solveErcCcd(sigma, [0.25, 0.25, 0.25, 0.25], 1e-4, 1);
      const sum = res.weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    });
  });

  describe('Tier 2: Boundary - Feature 2: Rolling Covariance & Volatility (F2)', () => {
    it('B2.1: single observation falls back to baseline diagonal variance', () => {
      const est = new RollingCovarianceEstimator({ baselineVariance: 0.0005 });
      est.addObservation({ arbitrage: 0.01, marl: 0.01, amm: 0.01, 'alpha-lab': 0.01 });
      const cov = est.getCovarianceMatrix();
      expect(cov.matrix[0][0]).toBeGreaterThan(0.0004);
      expect(cov.matrix[0][1]).toBe(0);
    });

    it('B2.2: perfectly collinear returns produce valid conditioned covariance without NaN', () => {
      const est = new RollingCovarianceEstimator({ windowSize: 10, ridgeEpsilon: 1e-6 });
      for (let i = 0; i < 5; i++) {
        est.addObservation({ arbitrage: 0.02 * i, marl: 0.02 * i, amm: 0.02 * i, 'alpha-lab': 0.02 * i });
      }
      const cov = est.getCovarianceMatrix();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(Number.isFinite(cov.matrix[r][c])).toBe(true);
        }
      }
    });

    it('B2.3: perfectly opposing returns (-1.0 correlation) generate negative off-diagonals', () => {
      const est = new RollingCovarianceEstimator({ windowSize: 10 });
      for (let i = 0; i < 6; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        est.addObservation({ arbitrage: 0.02 * sign, marl: -0.02 * sign, amm: 0.01, 'alpha-lab': 0.01 });
      }
      const cov = est.getCovarianceMatrix();
      expect(cov.matrix[0][1]).toBeLessThan(0);
    });

    it('B2.4: extreme outlier returns (+1000%) are incorporated with bounded variance', () => {
      const est = new RollingCovarianceEstimator();
      est.addObservation({ arbitrage: 0.01, marl: 0.01, amm: 0.01, 'alpha-lab': 0.01 });
      est.addObservation({ arbitrage: 10.0, marl: 0.01, amm: 0.01, 'alpha-lab': 0.01 });
      const cov = est.getCovarianceMatrix();
      expect(cov.matrix[0][0]).toBeGreaterThan(1.0);
    });

    it('B2.5: minimum window size = 2 drops old observations immediately on third update', () => {
      const est = new RollingCovarianceEstimator({ windowSize: 2 });
      est.addObservation({ arbitrage: 0.01, marl: 0.01, amm: 0.01, 'alpha-lab': 0.01 });
      est.addObservation({ arbitrage: 0.02, marl: 0.02, amm: 0.02, 'alpha-lab': 0.02 });
      est.addObservation({ arbitrage: 0.03, marl: 0.03, amm: 0.03, 'alpha-lab': 0.03 });
      expect(est.getObservationCount()).toBe(2);
    });
  });
}
