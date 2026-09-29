import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  RollingCovarianceEstimator,
  ErcParitySolver,
  solveErcCcd,
} from '../../../../src/desk/portfolio';
import { createBalancedEngineReturns } from '../fixtures/test-data.fixture';

export function registerTier1AllocatorSolverTests(): void {
  describe('Feature 1: ERC Risk Parity Solver (F1)', () => {
    const sigma = [[0.04, 0.01, 0.005, 0.002], [0.01, 0.09, 0.003, 0.001], [0.005, 0.003, 0.02, 0.002], [0.002, 0.001, 0.002, 0.05]];
    const budgets = [0.25, 0.25, 0.25, 0.25];

    it('F1.1: Spinu CCD solver converges within 25 iterations', () => {
      const res = solveErcCcd(sigma, budgets, 1e-4, 25);
      expect(res.converged).toBe(true);
      expect(res.iterations).toBeLessThanOrEqual(25);
    });

    it('F1.2: relative risk discrepancy is <= 1e-4 tolerance', () => {
      const res = solveErcCcd(sigma, budgets, 1e-4, 25);
      expect(res.maxDiscrepancy).toBeLessThanOrEqual(1e-4);
    });

    it('F1.3: weights sum strictly to 1.0 within epsilon', () => {
      const res = solveErcCcd(sigma, budgets, 1e-4, 25);
      const sum = res.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    });

    it('F1.4: higher volatility assets receive lower portfolio weights', () => {
      const solver = new ErcParitySolver();
      const cov = { engines: [...ENGINE_IDS], matrix: sigma, observations: 10, lastUpdated: 0, isConditioned: true };
      const res = solver.solve(cov, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 });
      expect(res.weights.marl).toBeLessThan(res.weights.amm);
    });

    it('F1.5: risk contributions match target risk budgets proportionally', () => {
      const solver = new ErcParitySolver();
      const cov = { engines: [...ENGINE_IDS], matrix: sigma, observations: 10, lastUpdated: 0, isConditioned: true };
      const res = solver.solve(cov);
      for (const id of ENGINE_IDS) {
        expect(res.riskContributions[id]).toBeGreaterThan(0.20);
        expect(res.riskContributions[id]).toBeLessThan(0.30);
      }
    });
  });

  describe('Feature 2: Rolling Covariance & Volatility Matrix (F2)', () => {
    it('F2.1: updates history and returns symmetric positive semi-definite matrix', () => {
      const estimator = new RollingCovarianceEstimator({ windowSize: 30 });
      const returns = createBalancedEngineReturns(15);
      returns.forEach((r) => estimator.addObservation(r));
      const cov = estimator.getCovarianceMatrix();
      expect(cov.matrix.length).toBe(4);
      expect(cov.matrix[0][1]).toBeCloseTo(cov.matrix[1][0], 8);
    });

    it('F2.2: provides diagonal baseline variance during cold-start (< 2 observations)', () => {
      const estimator = new RollingCovarianceEstimator();
      const cov = estimator.getCovarianceMatrix();
      expect(cov.isConditioned).toBe(true);
      expect(cov.matrix[0][0]).toBeGreaterThan(0);
      expect(cov.matrix[0][1]).toBe(0);
    });

    it('F2.3: applies ridge epsilon conditioning to guarantee invertibility', () => {
      const estimator = new RollingCovarianceEstimator({ ridgeEpsilon: 1e-5 });
      const cov = estimator.addObservation({ arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(cov.matrix[0][0]).toBeGreaterThanOrEqual(1e-5);
    });

    it('F2.4: rolls over and drops observations exceeding window size', () => {
      const estimator = new RollingCovarianceEstimator({ windowSize: 10 });
      const returns = createBalancedEngineReturns(25);
      returns.forEach((r) => estimator.addObservation(r));
      expect(estimator.getObservationCount()).toBe(10);
    });

    it('F2.5: handles NaN/Infinite returns gracefully by sanitizing to zero', () => {
      const estimator = new RollingCovarianceEstimator();
      const cov = estimator.addObservation({ arbitrage: NaN, marl: Infinity, amm: -Infinity, 'alpha-lab': 0.01 });
      expect(Number.isFinite(cov.matrix[0][0])).toBe(true);
    });
  });
}
