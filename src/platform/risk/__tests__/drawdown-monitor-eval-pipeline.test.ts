/**
 * Drawdown Monitor — Composite Evaluation Pipeline Tests
 * Covers: evaluateAllThresholds integration (7 tests)
 */

import { describe, it, expect } from 'vitest';
import { evaluateAllThresholds } from '../drawdown-monitor-evaluators';
import { DrawdownAlertTier } from '../drawdown-monitor-types';
import { makeMetrics, makeConfig } from './drawdown-monitor-evaluators-fixtures';

describe('evaluateAllThresholds', () => {
  it('returns NORMAL tier when all within limits', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.01, currentDrawdown: 0.05, consecutiveLosses: 1 });
    const result = evaluateAllThresholds(metrics);
    expect(result.tier).toBe(DrawdownAlertTier.NORMAL);
    expect(result.shouldHalt).toBe(false);
    expect(result.alerts).toHaveLength(0);
    expect(result.evaluations).toHaveLength(3);
  });

  it('returns WARNING tier with halt when daily breached', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.06, currentDrawdown: 0.02, consecutiveLosses: 0 });
    const result = evaluateAllThresholds(metrics);
    expect(result.tier).toBe(DrawdownAlertTier.WARNING);
    expect(result.shouldHalt).toBe(true);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].type).toBe('daily');
  });

  it('returns EMERGENCY tier when all thresholds breached', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.06, currentDrawdown: 0.16, consecutiveLosses: 6 });
    const result = evaluateAllThresholds(metrics);
    expect(result.tier).toBe(DrawdownAlertTier.EMERGENCY);
    expect(result.shouldHalt).toBe(true);
    expect(result.alerts).toHaveLength(3);
  });

  it('returns haltReason for first priority breach', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.06, currentDrawdown: 0.16, consecutiveLosses: 6 });
    const result = evaluateAllThresholds(metrics);
    expect(result.haltReason).toContain('Daily');
  });

  it('no halt when haltOnBreach is false even with breaches', () => {
    const config = makeConfig({ haltOnBreach: false });
    const metrics = makeMetrics({ dailyDrawdown: 0.06, currentDrawdown: 0.16, consecutiveLosses: 6 });
    const result = evaluateAllThresholds(metrics, config);
    expect(result.shouldHalt).toBe(false);
    expect(result.tier).toBe(DrawdownAlertTier.EMERGENCY);
    expect(result.alerts).toHaveLength(3);
  });

  it('evaluations have correct headroom values', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.04, currentDrawdown: 0.14, consecutiveLosses: 3 });
    const result = evaluateAllThresholds(metrics);
    const dailyEval = result.evaluations.find((e) => e.type === 'daily')!;
    expect(dailyEval.headroom).toBeCloseTo(0.01, 6);
    const totalEval = result.evaluations.find((e) => e.type === 'total')!;
    expect(totalEval.headroom).toBeCloseTo(0.01, 6);
    const consecEval = result.evaluations.find((e) => e.type === 'consecutive')!;
    expect(consecEval.headroom).toBe(2);
  });

  it('uses custom config', () => {
    const config = makeConfig({ dailyDrawdownLimit: 0.02, totalDrawdownLimit: 0.05, consecutiveLossLimit: 2 });
    const metrics = makeMetrics({ dailyDrawdown: 0.03, currentDrawdown: 0.06, consecutiveLosses: 3 });
    const result = evaluateAllThresholds(metrics, config);
    expect(result.tier).toBe(DrawdownAlertTier.EMERGENCY);
    expect(result.alerts).toHaveLength(3);
  });
});
