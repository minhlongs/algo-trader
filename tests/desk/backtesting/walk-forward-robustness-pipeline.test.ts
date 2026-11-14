/**
 * Acceptance-criterion chain test:
 * walk-forward train/calibrate/test with 4 liquidity regimes
 *   → Stationary Block Bootstrap 95% CI
 *   → Deflated Sharpe.
 */
import { describe, it, expect } from 'vitest';
import {
  computeWalkForwardRobustness,
  type WalkForwardRobustnessObservation,
} from '../../../src/desk/backtesting/walk-forward-robustness-pipeline';
import { LIQUIDITY_REGIMES } from '../../../src/desk/backtesting/liquidity-regimes';
import { splitAnchoredWalkForward } from '../../../src/desk/backtesting/walk-forward-splitter';

/** Deterministic weak-drift, moderate-noise series with a rotating liquidity mix. */
function buildObservations(length: number): WalkForwardRobustnessObservation[] {
  return Array.from({ length }, (_, i) => ({
    returnValue: 0.0002 + (((i * 7919) % 101) - 50) / 4000,
    liquidity: {
      spreadBps: i % 4 === 0 || i % 4 === 1 ? 20 : 500,
      depthUsd: i % 4 === 0 || i % 4 === 2 ? 50_000 : 1_000,
    },
  }));
}

describe('computeWalkForwardRobustness', () => {
  it('runs splits → 4 regimes → 95% CI → deflated Sharpe end to end', () => {
    const observations = buildObservations(400);
    const report = computeWalkForwardRobustness(observations, { nTrials: 40, seed: 7 });

    // Splits are the anchored walk-forward folds.
    const folds = splitAnchoredWalkForward(observations.length);
    expect(report.folds.length).toBe(folds.length);
    for (const foldResult of report.folds) {
      expect(foldResult.robustness).not.toBeNull();
      expect(foldResult.robustness!.overall.confidence).toBe(0.95);
      expect(foldResult.robustness!.overall.lower).toBeLessThanOrEqual(
        foldResult.robustness!.overall.upper,
      );
    }

    // All four regimes are reachable and each contributes observations.
    for (const regime of LIQUIDITY_REGIMES) {
      expect(report.pooled.regimeCounts[regime]).toBeGreaterThan(0);
      expect(report.pooled.perRegime[regime]).not.toBeNull();
    }

    // Deflated Sharpe is wired with the requested trial count.
    expect(report.pooled.deflatedSharpe.nTrials).toBe(40);
    expect(report.pooled.deflatedSharpe.probability).toBeGreaterThanOrEqual(0);
    expect(report.pooled.deflatedSharpe.probability).toBeLessThanOrEqual(1);
  });

  it('pools only out-of-sample (test) windows, never train or calibrate', () => {
    const observations = buildObservations(400);
    const report = computeWalkForwardRobustness(observations, { maxFolds: 2 });
    const folds = splitAnchoredWalkForward(observations.length, { maxFolds: 2 });

    const expectedPooled = folds.reduce((sum, fold) => sum + fold.test.length, 0);
    expect(report.pooledSampleLength).toBe(expectedPooled);
    expect(report.pooledSampleLength).toBeLessThan(observations.length);
  });

  it('is deterministic for a given seed', () => {
    const observations = buildObservations(300);
    const first = computeWalkForwardRobustness(observations, { seed: 5 });
    const second = computeWalkForwardRobustness(observations, { seed: 5 });
    expect(second.pooled).toEqual(first.pooled);
  });

  it('defers to the split fractions it is given', () => {
    const observations = buildObservations(1000);
    const report = computeWalkForwardRobustness(observations, {
      trainFraction: 0.4,
      calibrateFraction: 0.1,
      testFraction: 0.1,
      maxFolds: 3,
    });
    expect(report.folds.length).toBe(3);
    expect(report.folds[0].fold.train.startIndex).toBe(0);
    expect(report.folds[0].fold.test.length).toBe(100);
  });

  it('still works when liquidity inputs are absent', () => {
    const observations = buildObservations(200).map(({ returnValue }) => ({ returnValue }));
    const report = computeWalkForwardRobustness(observations, { seed: 1 });
    expect(report.pooled.overall.confidence).toBe(0.95);
    for (const regime of LIQUIDITY_REGIMES) {
      expect(report.pooled.perRegime[regime]).toBeNull();
    }
  });

  it('rejects a series too short for any fold', () => {
    expect(() => computeWalkForwardRobustness(buildObservations(3))).toThrow(RangeError);
    expect(() => computeWalkForwardRobustness([])).toThrow(RangeError);
  });
});
