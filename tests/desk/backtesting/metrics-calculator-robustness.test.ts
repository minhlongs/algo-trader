/**
 * Metrics calculator — robustness wiring.
 *
 * Verifies `computeMetricsWithRobustness` exposes overall + per-regime bootstrap
 * CIs and a deflated Sharpe, without disturbing the legacy report it embeds.
 * Legacy shape itself is pinned in metrics-calculator-legacy-compat.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  computeMetricsWithRobustness,
} from '../../../src/desk/backtesting/metrics-calculator';
import { equityCurveToReturns } from '../../../src/desk/backtesting/metrics-calculator-robustness';
import { LIQUIDITY_REGIMES } from '../../../src/desk/backtesting/liquidity-regimes';
import {
  LEGACY_METRIC_KEYS,
  equity,
  equityFromReturns,
  modestSharpeReturns,
  sampleTrades,
} from './metrics-robustness-fixtures';

describe('computeMetricsWithRobustness', () => {
  it('preserves the legacy metrics report alongside the new fields', () => {
    const curve = equity(120);
    const report = computeMetricsWithRobustness(sampleTrades(), curve);

    expect(Object.keys(report.metrics).sort()).toEqual(LEGACY_METRIC_KEYS);
    expect(report.metrics).toEqual(computeMetrics(sampleTrades(), curve));
    expect(report.returns).toEqual(equityCurveToReturns(curve));
  });

  it('exposes overall CI, per-regime CI and a deflated Sharpe', () => {
    const curve = equity(200);
    const returns = equityCurveToReturns(curve);
    const liquidity = returns.map((_, index) => ({
      // Alternate crafted regimes so every bucket has observations.
      spreadBps: index % 4 === 0 || index % 4 === 1 ? 20 : 500,
      depthUsd: index % 4 === 0 || index % 4 === 2 ? 50_000 : 1_000,
    }));

    const report = computeMetricsWithRobustness(sampleTrades(), curve, {
      liquidity,
      nTrials: 25,
      seed: 2026,
    });

    expect(report.robustness.sampleLength).toBe(returns.length);
    expect(report.robustness.overall.confidence).toBe(0.95);
    expect(report.robustness.overall.lower).toBeLessThanOrEqual(report.robustness.overall.upper);

    for (const regime of LIQUIDITY_REGIMES) {
      expect(report.robustness.regimeCounts[regime]).toBeGreaterThan(0);
      const interval = report.robustness.perRegime[regime];
      expect(interval).not.toBeNull();
      expect(interval!.lower).toBeLessThanOrEqual(interval!.upper);
    }

    const totalCounted = LIQUIDITY_REGIMES.reduce(
      (sum, regime) => sum + report.robustness.regimeCounts[regime],
      0,
    );
    expect(totalCounted).toBe(returns.length);

    expect(report.robustness.deflatedSharpe.nTrials).toBe(25);
    expect(report.robustness.deflatedSharpe.probability).toBeGreaterThanOrEqual(0);
    expect(report.robustness.deflatedSharpe.probability).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a given seed', () => {
    const curve = equity(150);
    const first = computeMetricsWithRobustness(sampleTrades(), curve, { seed: 11 });
    const second = computeMetricsWithRobustness(sampleTrades(), curve, { seed: 11 });
    expect(second.robustness.overall).toEqual(first.robustness.overall);
    expect(second.robustness.deflatedSharpe).toEqual(first.robustness.deflatedSharpe);
  });

  it('applies a harsher deflation when more trials were run', () => {
    const curve = equityFromReturns(modestSharpeReturns(400));
    const oneTrial = computeMetricsWithRobustness(sampleTrades(), curve, { nTrials: 1 });
    const manyTrials = computeMetricsWithRobustness(sampleTrades(), curve, { nTrials: 500 });

    // Guard the fixture: both probabilities must be unsaturated, otherwise the
    // strict-inequality comparison would prove nothing.
    expect(oneTrial.robustness.deflatedSharpe.probability).toBeLessThan(0.999);
    expect(manyTrials.robustness.deflatedSharpe.probability).toBeLessThan(
      oneTrial.robustness.deflatedSharpe.probability,
    );
  });

  it('reports empty per-regime buckets as null when no liquidity is supplied', () => {
    const report = computeMetricsWithRobustness(sampleTrades(), equity(80));
    for (const regime of LIQUIDITY_REGIMES) {
      expect(report.robustness.perRegime[regime]).toBeNull();
      expect(report.robustness.regimeCounts[regime]).toBe(0);
    }
    expect(report.robustness.overall.confidence).toBe(0.95);
  });

  it('rejects a liquidity array of the wrong length and a too-short curve', () => {
    expect(() =>
      computeMetricsWithRobustness(sampleTrades(), equity(50), {
        liquidity: [{ spreadBps: 10, depthUsd: 50_000 }],
      }),
    ).toThrow(RangeError);

    expect(() =>
      computeMetricsWithRobustness(sampleTrades(), [{ timestamp: 'a', equity: 1000 }]),
    ).toThrow(RangeError);
  });
});
