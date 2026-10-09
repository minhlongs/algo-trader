/**
 * Unit Tests for Barndorff-Nielsen & Shephard (2004) BPV Suite.
 * Strictly zero-mock, real high-frequency econometric mathematics, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  BiPowerVariationEngine,
  computeBipowerVariation,
  computeRealizedVariance,
  computeTripowerQuarticity,
  evaluateBnsJumpTest,
} from '../../../../src/desk/bipower';

describe('Barndorff-Nielsen & Shephard (2004) BPV & Jump Suite', () => {
  // Pure continuous diffusion sample (Gaussian increments, no jumps)
  const continuousReturns: readonly number[] = [
    0.0005, -0.0004, 0.0006, -0.0003, 0.0007, -0.0005, 0.0004, -0.0006,
    0.0003, 0.0005, -0.0004, 0.0006, -0.0002, 0.0005, -0.0007, 0.0003,
    -0.0005, 0.0004, -0.0003, 0.0006, -0.0004, 0.0005, -0.0003, 0.0004,
  ];

  // Intraday return sequence with a discrete jump shock at index 10
  const jumpReturns: readonly number[] = [
    ...continuousReturns.slice(0, 10),
    0.0150, // Massive 1.5% single-tick discrete jump
    ...continuousReturns.slice(11),
  ];

  it('computes RV, BV, and TPQ where RV and BV closely match for continuous diffusion', () => {
    const rv = computeRealizedVariance(continuousReturns);
    const bv = computeBipowerVariation(continuousReturns);
    const tpq = computeTripowerQuarticity(continuousReturns);

    expect(rv).toBeGreaterThan(0);
    expect(bv).toBeGreaterThan(0);
    expect(tpq).toBeGreaterThan(0);

    // For continuous diffusion, BV approximates RV closely
    const ratio = bv / rv;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  });

  it('detects discrete jump day with significant positive Z-statistic and high jump proportion', () => {
    const contResult = evaluateBnsJumpTest(continuousReturns);
    const jumpResult = evaluateBnsJumpTest(jumpReturns);

    // On continuous path, Z-statistic should be low
    expect(contResult.isJumpDay).toBe(false);
    expect(contResult.jumpProportion).toBeLessThan(0.3);

    // On jump path, RV dominates BV significantly
    expect(jumpResult.realizedVariance).toBeGreaterThan(jumpResult.bipowerVariation);
    expect(jumpResult.jumpVariance).toBeGreaterThan(0);
    expect(jumpResult.jumpProportion).toBeGreaterThan(0.5);
    expect(jumpResult.zStatistic).toBeGreaterThan(2.0);
    expect(jumpResult.isJumpDay).toBe(true);
    expect(jumpResult.pValue).toBeLessThan(0.05);
  });

  it('aggregates historical daily series into jump decomposition summary', () => {
    const engine = new BiPowerVariationEngine();
    const history = [
      continuousReturns,
      continuousReturns,
      jumpReturns, // 1 jump day out of 4
      continuousReturns,
    ];

    const summary = engine.analyzeHistory(history);
    expect(summary.totalDays).toBe(4);
    expect(summary.jumpDaysCount).toBe(1);
    expect(summary.jumpFrequencyPct).toBe(25.0);
    expect(summary.meanRealizedVol).toBeGreaterThan(0);
    expect(summary.meanContinuousVol).toBeGreaterThan(0);
    expect(summary.meanJumpVol).toBeGreaterThan(0);
  });

  it('extracts pure continuous volatility separating jump contamination', () => {
    const engine = new BiPowerVariationEngine();
    const result = engine.extractPureContinuousComponent(jumpReturns);

    expect(result.jumpDetected).toBe(true);
    expect(result.continuousVol).toBeGreaterThan(0);
    expect(result.jumpVol).toBeGreaterThan(0);
    // Continuous vol should be much smaller than the jump-contaminated total vol
    expect(result.continuousVol).toBeLessThan(result.jumpVol);
  });

  it('handles edge cases and rejects insufficient intraday sample size', () => {
    const engine = new BiPowerVariationEngine();
    expect(() => engine.analyzeDay([0.001, -0.002, 0.003])).toThrow(
      'requires at least 5 intraday returns'
    );
    expect(() => engine.analyzeHistory([])).toThrow(
      'Cannot analyze empty historical intraday series'
    );
  });
});
