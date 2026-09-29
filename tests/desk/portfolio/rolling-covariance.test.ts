import { describe, it, expect } from 'vitest';
import { RollingCovarianceEstimator } from '../../../src/desk/portfolio/rolling-covariance';
import { ENGINE_IDS, EngineId } from '../../../src/desk/portfolio/types';

describe('Rolling Covariance Estimator (Welford & Ridge Conditioning)', () => {
  it('handles cold start (< 2 observations) with diagonal identity fallback', () => {
    const estimator = new RollingCovarianceEstimator({
      coldStartWindow: 20,
      ridgeEpsilon: 1e-7,
      baselineVariance: 0.0004,
    });

    const cov0 = estimator.getCovarianceMatrix();
    expect(cov0.observations).toBe(0);
    expect(cov0.isConditioned).toBe(true);
    // Check diagonal is baseline + ridge
    for (let i = 0; i < 4; i++) {
      expect(cov0.matrix[i][i]).toBeCloseTo(0.0004 + 1e-7, 7);
      for (let j = 0; j < 4; j++) {
        if (i !== j) expect(cov0.matrix[i][j]).toBe(0);
      }
    }

    // 1 observation is still cold start
    estimator.addObservation({
      arbitrage: 0.01,
      marl: 0.02,
      amm: -0.01,
      'alpha-lab': 0.03,
    });
    const cov1 = estimator.getCovarianceMatrix();
    expect(cov1.observations).toBe(1);
    expect(cov1.matrix[0][0]).toBeCloseTo(0.0004 + 1e-7, 7);
  });

  it('smoothly conditions covariance during cold start window (2 <= n < 20)', () => {
    const estimator = new RollingCovarianceEstimator({
      coldStartWindow: 20,
      ridgeEpsilon: 1e-7,
    });

    for (let i = 0; i < 10; i++) {
      estimator.addObservation({
        arbitrage: 0.01 * (i % 2 === 0 ? 1 : -1),
        marl: 0.015 * (i % 2 === 0 ? 1 : -1),
        amm: 0.005 * (i % 3 === 0 ? 1 : -1),
        'alpha-lab': 0.02 * (i % 2 === 0 ? 1 : -1),
      });
    }

    const cov = estimator.getCovarianceMatrix();
    expect(cov.observations).toBe(10);
    // Off-diagonals are shrunk by alpha = 10 / 20 = 0.5
    expect(cov.matrix[0][0]).toBeGreaterThan(0);
    expect(cov.isConditioned).toBe(true);
  });

  it('calculates accurate sample covariance after cold start window (n >= 20)', () => {
    const estimator = new RollingCovarianceEstimator({
      coldStartWindow: 20,
      ridgeEpsilon: 1e-7,
    });

    for (let i = 0; i < 25; i++) {
      estimator.addObservation({
        arbitrage: 0.001 * (i + 1),
        marl: 0.002 * (i + 1),
        amm: -0.001 * (i + 1),
        'alpha-lab': 0.003 * (i + 1),
      });
    }

    const cov = estimator.getCovarianceMatrix();
    expect(cov.observations).toBe(25);
    // Arbitrage (idx 0) and marl (idx 1) are positively correlated
    const corrs = estimator.getCorrelations();
    expect(corrs.arbitrage.marl).toBeCloseTo(1.0, 2);
    // Arbitrage and amm are negatively correlated
    expect(corrs.arbitrage.amm).toBeCloseTo(-1.0, 2);

    const vols = estimator.getVolatilities();
    for (const id of ENGINE_IDS) {
      expect(vols[id]).toBeGreaterThan(0);
    }
  });

  it('slides window when observation count exceeds windowSize', () => {
    const windowSize = 10;
    const estimator = new RollingCovarianceEstimator({ windowSize, coldStartWindow: 5 });

    for (let i = 0; i < 20; i++) {
      estimator.addObservation({
        arbitrage: 0.01 * i,
        marl: 0.01 * i,
        amm: 0.01 * i,
        'alpha-lab': 0.01 * i,
      });
    }

    expect(estimator.getObservationCount()).toBe(windowSize);
    const cov = estimator.getCovarianceMatrix();
    expect(cov.observations).toBe(windowSize);
  });

  it('resets and adjusts ridge epsilon correctly', () => {
    const estimator = new RollingCovarianceEstimator();
    estimator.addObservation({ arbitrage: 0.01, marl: 0.01, amm: 0.01, 'alpha-lab': 0.01 });
    expect(estimator.getObservationCount()).toBe(1);

    estimator.reset();
    expect(estimator.getObservationCount()).toBe(0);

    estimator.setRidgeEpsilon(1e-5);
    const cov = estimator.getCovarianceMatrix();
    expect(cov.matrix[0][0]).toBeCloseTo(0.0004 + 1e-5, 6);
  });
});
