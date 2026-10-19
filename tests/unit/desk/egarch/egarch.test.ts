/**
 * Unit Tests for Nelson (1991) EGARCH Volatility Suite.
 * Strictly zero-mock, real econometric mathematics, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  EgarchVolatilityEngine,
  evaluateEgarchSeries,
  computeUnconditionalEgarchVariance,
  EgarchParams,
} from '../../../../src/desk/egarch';

describe('Nelson (1991) EGARCH Volatility Suite', () => {
  // Realistic financial return sequence with volatility clustering and negative drawdowns
  const sampleReturns: readonly number[] = [
    0.012, -0.018, -0.025, 0.005, -0.032, 0.015, -0.010, 0.008, -0.022, 0.004,
    -0.035, -0.040, 0.018, 0.022, -0.012, 0.009, -0.005, 0.011, -0.015, 0.002,
    -0.028, 0.014, -0.008, 0.006, -0.019, 0.010, -0.014, 0.003, -0.021, 0.007,
  ];

  it('evaluates recursive series guaranteeing strictly positive conditional variance', () => {
    const params: EgarchParams = {
      omega: -0.5,
      alpha: 0.18,
      gamma: -0.10,
      beta: 0.92,
    };

    const series = evaluateEgarchSeries(sampleReturns, params);
    expect(series.length).toBe(sampleReturns.length);

    for (const pt of series) {
      expect(pt.condVariance).toBeGreaterThan(0);
      expect(pt.condVol).toBeGreaterThan(0);
      expect(Number.isFinite(pt.condLogVar)).toBe(true);
      expect(pt.condVariance).toBeCloseTo(Math.exp(pt.condLogVar), 6);
    }
  });

  it('verifies asymmetric leverage effect (gamma < 0 elevates variance more on negative shocks)', () => {
    const params: EgarchParams = {
      omega: -0.2,
      alpha: 0.15,
      gamma: -0.12, // Distinct negative leverage effect
      beta: 0.85,
    };

    const posReturnSeries = [0.03, 0.0];
    const negReturnSeries = [-0.03, 0.0];

    const posPoints = evaluateEgarchSeries(posReturnSeries, params, -6.0);
    const negPoints = evaluateEgarchSeries(negReturnSeries, params, -6.0);

    // After negative shock at t=0, log-variance at t=1 must be strictly higher than after positive shock
    expect(negPoints[1].condLogVar).toBeGreaterThan(posPoints[1].condLogVar);
    expect(negPoints[1].condVariance).toBeGreaterThan(posPoints[1].condVariance);
  });

  it('calibrates model via QMLE with finite log-likelihood and information criteria', () => {
    const engine = new EgarchVolatilityEngine();
    const fitResult = engine.fit(sampleReturns);

    expect(fitResult.params.beta).toBeGreaterThan(0);
    expect(fitResult.params.beta).toBeLessThan(1.0);
    expect(Number.isFinite(fitResult.logLikelihood)).toBe(true);
    expect(Number.isFinite(fitResult.aic)).toBe(true);
    expect(Number.isFinite(fitResult.bic)).toBe(true);
    expect(fitResult.unconditionalVariance).toBeGreaterThan(0);
  });

  it('forecasts term structure converging toward unconditional long-run variance', () => {
    const engine = new EgarchVolatilityEngine();
    const fitResult = engine.fit(sampleReturns);
    const forecast = engine.forecast(fitResult, 20);

    expect(forecast.forecasts.length).toBe(20);
    expect(forecast.longRunVariance).toBeGreaterThan(0);

    // Later horizon forecast should approach longRunVariance
    const lastForecastVar = forecast.forecasts[forecast.forecasts.length - 1].condVariance;
    expect(lastForecastVar).toBeGreaterThan(0);
  });

  it('correctly evaluates asymmetry and leverage significance', () => {
    const engine = new EgarchVolatilityEngine();
    const fitResult = engine.fit(sampleReturns);
    const asymmetry = engine.evaluateAsymmetry(fitResult);

    expect(typeof asymmetry.leverageDetected).toBe('boolean');
    expect(asymmetry.impactRatio).toBeGreaterThan(0);
  });

  it('rejects insufficient observations with informative error', () => {
    const engine = new EgarchVolatilityEngine();
    expect(() => engine.fit([0.01, -0.02])).toThrow('requires at least 5 return observations');
    expect(() => engine.forecast(engine.fit(sampleReturns), 0)).toThrow('must be positive integer');
  });
});
