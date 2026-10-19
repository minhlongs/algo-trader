/**
 * Unit Tests for Engle (2002) DCC-GARCH Dynamic Correlation Suite.
 * Strictly zero-mock, real econometric mathematics, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  DccGarchEngine,
  computeUnconditionalCorrelation,
  evaluateDccSeries,
  DccParams,
} from '../../../../src/desk/dccgarch';

describe('Engle (2002) DCC-GARCH Dynamic Correlation Suite', () => {
  // Realistic paired standardized residuals and volatilities for 2 correlated assets
  const sampleZ: readonly (readonly number[])[] = [
    [0.5, 0.4], [-0.8, -0.6], [1.2, 0.9], [-0.3, -0.2], [0.1, 0.3],
    [-1.5, -1.2], [0.4, 0.5], [0.8, 0.7], [-0.9, -0.7], [0.2, 0.1],
    [-1.1, -0.9], [1.4, 1.1], [-0.6, -0.5], [0.3, 0.2], [-0.2, -0.1],
    [0.7, 0.6], [-0.4, -0.3], [1.0, 0.8], [-1.3, -1.0], [0.5, 0.4],
  ];

  const sampleVols: readonly (readonly number[])[] = Array.from(
    { length: sampleZ.length },
    () => [0.015, 0.020]
  );

  it('computes unconditional correlation matrix with strict unit diagonal and [-1, 1] bounds', () => {
    const qBar = computeUnconditionalCorrelation(sampleZ);
    expect(qBar.length).toBe(2);
    expect(qBar[0][0]).toBeCloseTo(1.0, 5);
    expect(qBar[1][1]).toBeCloseTo(1.0, 5);
    expect(qBar[0][1]).toBeGreaterThan(0.5); // Positively correlated sample
    expect(qBar[0][1]).toBeLessThanOrEqual(1.0);
    expect(qBar[1][0]).toBeCloseTo(qBar[0][1], 5);
  });

  it('evaluates time-varying correlation matrix maintaining positive definiteness', () => {
    const params: DccParams = { alpha: 0.05, beta: 0.90 };
    const qBar = computeUnconditionalCorrelation(sampleZ);
    const series = evaluateDccSeries(sampleZ, sampleVols, params, qBar);

    expect(series.length).toBe(sampleZ.length);
    for (const pt of series) {
      const R = pt.correlationMatrix;
      expect(R[0][0]).toBe(1.0);
      expect(R[1][1]).toBe(1.0);
      expect(R[0][1]).toBeGreaterThanOrEqual(-1.0);
      expect(R[0][1]).toBeLessThanOrEqual(1.0);
      // Determinant of 2x2 correlation matrix 1 - rho^2 >= 0
      const det = 1.0 - R[0][1] * R[0][1];
      expect(det).toBeGreaterThan(0);
      expect(pt.dynamicHedgeRatio12).toBeGreaterThan(0);
    }
  });

  it('calibrates DCC parameters via QMLE with alpha + beta < 1', () => {
    const engine = new DccGarchEngine();
    const result = engine.fit(sampleZ, sampleVols);

    expect(result.params.alpha).toBeGreaterThanOrEqual(0);
    expect(result.params.beta).toBeGreaterThan(0);
    expect(result.persistence).toBeLessThan(1.0);
    expect(Number.isFinite(result.logLikelihood)).toBe(true);
    expect(result.averageCorrelation12).toBeGreaterThan(0.5);
  });

  it('computes dynamic minimum-variance hedge ratios across time', () => {
    const engine = new DccGarchEngine();
    const result = engine.fit(sampleZ, sampleVols);
    const hedgeRatios = engine.computeDynamicHedgeRatios(result);

    expect(hedgeRatios.length).toBe(sampleZ.length);
    for (const hr of hedgeRatios) {
      expect(Number.isFinite(hr.hedgeRatio)).toBe(true);
      expect(hr.hedgeRatio).toBeGreaterThan(0);
      expect(hr.correlation).toBeGreaterThan(0);
    }
  });

  it('forecasts one-step ahead correlation matrix and dynamic hedge ratio', () => {
    const engine = new DccGarchEngine();
    const result = engine.fit(sampleZ, sampleVols);
    const lastZ = sampleZ[sampleZ.length - 1];
    const forecast = engine.forecastNextCorrelation(result, lastZ);

    expect(forecast.predictedCorrelationMatrix[0][0]).toBe(1.0);
    expect(forecast.predictedCorrelationMatrix[1][1]).toBe(1.0);
    expect(forecast.predictedCorrelationMatrix[0][1]).toBeGreaterThan(0.5);
    expect(forecast.predictedHedgeRatio12).toBeGreaterThan(0);
  });

  it('rejects short observation series with informative error', () => {
    const engine = new DccGarchEngine();
    expect(() => engine.fit([[1, 2], [3, 4]], [[0.01, 0.02], [0.01, 0.02]])).toThrow(
      'requires at least 5 multivariate observations'
    );
  });
});
