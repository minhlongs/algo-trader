/**
 * Metrics calculator — backward compatibility.
 *
 * Pins the pre-existing export surface and report shape so the additive
 * robustness work cannot silently change it.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeProfitFactor,
  computeSortinoRatio,
  computeCalmarRatio,
} from '../../../src/desk/backtesting/metrics-calculator';
import {
  computePerPeriodSharpe,
  computeSkewness,
  computeKurtosis,
  equityCurveToReturns,
} from '../../../src/desk/backtesting/metrics-calculator-robustness';
import { LEGACY_METRIC_KEYS, sampleTrades } from './metrics-robustness-fixtures';

describe('pre-existing exports behave identically', () => {
  it('computeMetrics returns exactly the legacy shape and values', () => {
    const metrics = computeMetrics(sampleTrades(), [
      { timestamp: 't0', equity: 1000 },
      { timestamp: 't2', equity: 1010 },
      { timestamp: 't4', equity: 1005 },
    ]);

    expect(Object.keys(metrics).sort()).toEqual(LEGACY_METRIC_KEYS);
    expect(metrics.totalPnl).toBe(5);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.profitFactor).toBe(2);
    expect(metrics.totalTrades).toBe(2);
    expect(metrics.winningTrades).toBe(1);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.bestTrade).toBe(10);
    expect(metrics.worstTrade).toBe(-5);
    expect(metrics.avgPnlPerTrade).toBe(2.5);
    expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
    expect(Number.isFinite(metrics.maxDrawdown)).toBe(true);
  });

  it('the scalar helpers keep their contracts', () => {
    expect(computeMaxDrawdown([{ equity: 1000 }, { equity: 1200 }, { equity: 900 }])).toBeCloseTo(-0.25, 4);
    expect(computeSharpeRatio([{ equity: 1000 }])).toBe(0);
    expect(computeProfitFactor([{ pnl: 100 }, { pnl: -50 }])).toBe(2);
    expect(computeSortinoRatio([0.01, 0.02])).toBe(50);
    expect(computeCalmarRatio(0.3, 0.15)).toBeCloseTo(2, 4);
    expect(computeCalmarRatio(0, 0)).toBe(0);
  });
});

describe('robustness helpers', () => {
  it('equityCurveToReturns matches the Sharpe formula inputs', () => {
    const returns = equityCurveToReturns([
      { equity: 1000 },
      { equity: 1100 },
      { equity: 990 },
    ]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 12);
    expect(returns[1]).toBeCloseTo(-0.1, 12);
  });

  it('equityCurveToReturns skips zero-equity steps', () => {
    expect(equityCurveToReturns([{ equity: 0 }, { equity: 100 }])).toEqual([]);
  });

  it('computePerPeriodSharpe is 0 for a constant series and positive for a drifting one', () => {
    expect(computePerPeriodSharpe([0.01, 0.01, 0.01])).toBe(0);
    expect(computePerPeriodSharpe([0.01, 0.02, 0.03, 0.02])).toBeGreaterThan(0);
    expect(computePerPeriodSharpe([0.01])).toBe(0);
  });

  it('skewness and kurtosis match symmetric benchmarks', () => {
    const symmetric = [-1, 0, 1, 0, -1, 1];
    expect(computeSkewness(symmetric)).toBeCloseTo(0, 9);
    // A normal-ish sample has non-excess kurtosis around 3, never negative.
    expect(computeKurtosis(symmetric)).toBeGreaterThan(1);
    expect(computeKurtosis([1, 1, 1])).toBe(3);
    expect(computeSkewness([1])).toBe(0);
  });

  it('skewness is positive for a right-tailed sample', () => {
    expect(computeSkewness([1, 1, 1, 1, 10])).toBeGreaterThan(0);
  });
});
