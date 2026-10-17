/**
 * Deterministic Zero-Mock Test Suite for ABDL (2003) & Corsi (2009) HAR-RV Multi-Horizon Volatility.
 * Strictly < 150 LOC, zero :any types, zero mocks.
 */

import { describe, expect, it } from 'vitest';
import { AbdlHarEngine, AbdlHarEstimator, DailyRealizedMetrics, HarObservationRow } from '../../../../src/desk/abdl';

describe('ABDL & Corsi HAR-RV Volatility Suite', () => {
  const estimator = new AbdlHarEstimator();
  const engine = new AbdlHarEngine();

  // Deterministic LCG generator for pseudo-intraday returns
  const generateIntradayDay = (dateIndex: number, hasJump: boolean = false): number[] => {
    let state = (dateIndex * 1664525 + 1013904223) % 4294967296;
    const returns: number[] = [];
    const numTicks = 78; // 5-minute ticks in 6.5 hour trading day

    for (let i = 0; i < numTicks; i++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      const u = ((state % 10000) - 5000) / 100000.0;
      returns.push(u);
    }
    if (hasJump) {
      returns[Math.floor(numTicks / 2)] += 0.04; // Add discrete price jump
    }
    return returns;
  };

  it('computes daily realized variance, bipower variation, and separates jump variance', () => {
    const normalDay = generateIntradayDay(1, false);
    const normalMetrics = estimator.computeDailyMetrics(1, normalDay);

    expect(normalMetrics.realizedVariance).toBeGreaterThan(0.0);
    expect(normalMetrics.bipowerVariation).toBeGreaterThan(0.0);
    expect(normalMetrics.continuousVariance).toBeGreaterThan(0.0);
    expect(normalMetrics.jumpVariance).toBeGreaterThanOrEqual(0.0);
    expect(normalMetrics.continuousVariance + normalMetrics.jumpVariance).toBeCloseTo(normalMetrics.realizedVariance, 5);

    // Jump day test: add discrete jump (+0.30)
    const jumpDay = [...normalDay];
    jumpDay[39] += 0.30;
    const jumpMetrics = estimator.computeDailyMetrics(2, jumpDay);
    expect(jumpMetrics.realizedVariance).toBeGreaterThan(normalMetrics.realizedVariance);
    expect(jumpMetrics.jumpVariance).toBeGreaterThan(0.0);
  });

  it('throws error when intraday returns has fewer than 2 samples', () => {
    expect(() => estimator.computeDailyMetrics(1, [0.001])).toThrow('At least 2 intraday return samples');
  });

  it('constructs multi-horizon HAR dataset and fits Corsi (2009) regression', () => {
    const allMetrics: DailyRealizedMetrics[] = [];
    for (let day = 1; day <= 60; day++) {
      const returns = generateIntradayDay(day, day % 15 === 0);
      allMetrics.push(estimator.computeDailyMetrics(day, returns));
    }

    const harDataset = estimator.buildHarDataset(allMetrics, { dailyLag: 1, weeklyLag: 5, monthlyLag: 22 });
    expect(harDataset.length).toBe(60 - 22);

    const coeffs = engine.fit(harDataset);
    expect(coeffs.beta0).toBeDefined();
    expect(coeffs.betaDaily).toBeDefined();
    expect(coeffs.betaWeekly).toBeDefined();
    expect(coeffs.betaMonthly).toBeDefined();
    expect(coeffs.rSquared).toBeGreaterThanOrEqual(0.0);
    expect(coeffs.rSquared).toBeLessThanOrEqual(1.0);
    expect(coeffs.residualVariance).toBeGreaterThan(0.0);

    // Forecast out-of-sample next day
    const latestRow: HarObservationRow = harDataset[harDataset.length - 1]!;
    const forecast = engine.forecast(latestRow, coeffs, harDataset);

    expect(forecast.predictedRv).toBeGreaterThan(0.0);
    expect(forecast.predictedVolatility).toBeCloseTo(Math.sqrt(forecast.predictedRv), 5);
    expect(forecast.horizonDays).toBe(1);
    expect(forecast.rmse).toBeGreaterThan(0.0);
    expect(forecast.mae).toBeGreaterThan(0.0);
  });

  it('throws when dataset is too short for regression', () => {
    const tinyRows: HarObservationRow[] = Array.from({ length: 5 }, () => ({
      targetRv: 0.001,
      rvDaily: 0.001,
      rvWeekly: 0.001,
      rvMonthly: 0.001,
    }));
    expect(() => engine.fit(tinyRows)).toThrow('At least 10 observation rows required');
  });
});
