/**
 * Unit Tests for Bollerslev (1986) GARCH & Glosten-Jagannathan-Runkle (1993) GJR-GARCH.
 * Strictly zero-mock, real financial econometrics, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  GarchVolatilityEngine,
  GjrGarchParams,
  calculatePersistence,
  calculateUnconditionalVariance,
  calculateVariancesAndResiduals,
} from '../../../../src/desk/garch';

describe('Bollerslev (1986) & GJR-GARCH (1993) Volatility Suite', () => {
  // Deterministic realistic return series with volatility clustering
  const sampleReturns = [
    0.012, -0.018, -0.035, 0.024, -0.029,
    0.005, -0.008, 0.015, -0.011, 0.007,
    0.032, -0.041, 0.038, -0.025, 0.018,
    -0.012, 0.004, -0.006, 0.009, -0.003,
  ];

  it('verifies standard GARCH(1,1) parameter persistence and long-run variance', () => {
    const params: GjrGarchParams = {
      omega: 0.00002,
      alpha: 0.08,
      beta: 0.88,
      gamma: 0.0,
      mu: 0.0,
    };

    const persistence = calculatePersistence(params);
    expect(persistence).toBeCloseTo(0.96, 4);

    const longRunVar = calculateUnconditionalVariance(params);
    expect(longRunVar).toBeCloseTo(0.00002 / 0.04, 6);
    expect(longRunVar).toBeGreaterThan(0);
  });

  it('verifies GJR-GARCH asymmetric leverage effect on negative shocks', () => {
    const paramsGjr: GjrGarchParams = {
      omega: 0.00001,
      alpha: 0.04,
      beta: 0.85,
      gamma: 0.08, // Asymmetric leverage parameter
      mu: 0.0,
    };

    // Case 1: Positive shock (+4%) at t=0
    const positiveShock = [0.04, 0.0];
    const resPos = calculateVariancesAndResiduals(positiveShock, paramsGjr);

    // Case 2: Negative shock (-4%) at t=0
    const negativeShock = [-0.04, 0.0];
    const resNeg = calculateVariancesAndResiduals(negativeShock, paramsGjr);

    // In GJR-GARCH, negative shock must generate higher conditional variance at t=1 due to gamma > 0
    expect(resNeg.variances[1]).toBeGreaterThan(resPos.variances[1]);

    // Difference in variance should equal gamma * shock^2
    const varDiff = resNeg.variances[1] - resPos.variances[1];
    expect(varDiff).toBeCloseTo(0.08 * 0.04 * 0.04, 6);
  });

  it('calibrates standard GARCH and GJR-GARCH via QMLE', () => {
    const engine = new GarchVolatilityEngine();

    const standardFit = engine.fitStandard(sampleReturns);
    expect(standardFit.modelType).toBe('STANDARD_GARCH');
    expect(standardFit.isStationary).toBe(true);
    expect(standardFit.persistence).toBeLessThan(1.0);
    expect(standardFit.params.omega).toBeGreaterThan(0);
    expect(standardFit.conditionalVariances.length).toBe(sampleReturns.length);
    expect(standardFit.aic).toBeDefined();

    const gjrFit = engine.fitGjr(sampleReturns);
    expect(gjrFit.modelType).toBe('GJR_GARCH');
    expect(gjrFit.isStationary).toBe(true);
    expect(gjrFit.params.gamma).toBeGreaterThanOrEqual(0);
    expect(gjrFit.conditionalVariances.length).toBe(sampleReturns.length);
  });

  it('forecasts multi-step volatility term structure converging to long-run mean', () => {
    const engine = new GarchVolatilityEngine();
    const fit = engine.fitStandard(sampleReturns);
    const horizon = 20;

    const forecast = engine.forecast(fit, horizon);
    expect(forecast.steps.length).toBe(horizon);
    expect(forecast.steps[0].step).toBe(1);
    expect(forecast.steps[horizon - 1].step).toBe(horizon);

    // Volatility should remain positive and bounded
    for (const step of forecast.steps) {
      expect(step.variance).toBeGreaterThan(0);
      expect(step.annualizedVol).toBeGreaterThan(0);
    }

    // High horizon should be closer to longRunVariance than current variance
    const diffFinal = Math.abs(forecast.steps[horizon - 1].variance - forecast.longRunVariance);
    const diffInitial = Math.abs(forecast.currentVariance - forecast.longRunVariance);
    if (diffInitial > 1e-6) {
      expect(diffFinal).toBeLessThan(diffInitial);
    }
  });

  it('handles error on insufficient sample length', () => {
    const engine = new GarchVolatilityEngine();
    expect(() => engine.fitStandard([0.01, -0.02])).toThrow('Insufficient returns');
  });
});
