/**
 * Drawdown Monitor — Individual Threshold Evaluators Tests
 * Covers: evaluateDailyDrawdown, evaluateTotalDrawdown, evaluateConsecutiveLosses (16 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateDailyDrawdown,
  evaluateTotalDrawdown,
  evaluateConsecutiveLosses,
} from '../drawdown-monitor-evaluators';
import { DEFAULT_THRESHOLD_CONFIG } from '../drawdown-monitor-types';
import { makeMetrics, makeConfig } from './drawdown-monitor-evaluators-fixtures';

describe('evaluateDailyDrawdown', () => {
  it('returns not breached when daily drawdown is zero', () => {
    const result = evaluateDailyDrawdown(makeMetrics({ dailyDrawdown: 0 }));
    expect(result.breached).toBe(false);
    expect(result.type).toBe('daily');
    expect(result.headroom).toBeCloseTo(DEFAULT_THRESHOLD_CONFIG.dailyDrawdownLimit, 6);
  });

  it('returns not breached when just below threshold', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.0499 });
    const result = evaluateDailyDrawdown(metrics);
    expect(result.breached).toBe(false);
    expect(result.headroom).toBeCloseTo(0.05 - 0.0499, 6);
  });

  it('returns breached when at exact threshold', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.05 });
    const result = evaluateDailyDrawdown(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBeCloseTo(0, 6);
  });

  it('returns breached when above threshold', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.08 });
    const result = evaluateDailyDrawdown(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBeCloseTo(-0.03, 6);
  });

  it('uses custom config threshold', () => {
    const config = makeConfig({ dailyDrawdownLimit: 0.03 });
    const metrics = makeMetrics({ dailyDrawdown: 0.04 });
    const result = evaluateDailyDrawdown(metrics, config);
    expect(result.breached).toBe(true);
    expect(result.threshold).toBe(0.03);
  });

  it('reports correct current and threshold values', () => {
    const metrics = makeMetrics({ dailyDrawdown: 0.07 });
    const result = evaluateDailyDrawdown(metrics);
    expect(result.current).toBe(0.07);
    expect(result.threshold).toBe(DEFAULT_THRESHOLD_CONFIG.dailyDrawdownLimit);
  });
});

describe('evaluateTotalDrawdown', () => {
  it('returns not breached when total drawdown is zero', () => {
    const result = evaluateTotalDrawdown(makeMetrics({ currentDrawdown: 0 }));
    expect(result.breached).toBe(false);
    expect(result.type).toBe('total');
  });

  it('returns breached at exact threshold', () => {
    const metrics = makeMetrics({ currentDrawdown: 0.15 });
    const result = evaluateTotalDrawdown(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBeCloseTo(0, 6);
  });

  it('returns breached when above threshold', () => {
    const metrics = makeMetrics({ currentDrawdown: 0.20 });
    const result = evaluateTotalDrawdown(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBeCloseTo(-0.05, 6);
  });

  it('returns not breached when below threshold', () => {
    const metrics = makeMetrics({ currentDrawdown: 0.149 });
    const result = evaluateTotalDrawdown(metrics);
    expect(result.breached).toBe(false);
  });

  it('uses custom config threshold', () => {
    const config = makeConfig({ totalDrawdownLimit: 0.10 });
    const metrics = makeMetrics({ currentDrawdown: 0.11 });
    const result = evaluateTotalDrawdown(metrics, config);
    expect(result.breached).toBe(true);
    expect(result.threshold).toBe(0.10);
  });
});

describe('evaluateConsecutiveLosses', () => {
  it('returns not breached with zero losses', () => {
    const result = evaluateConsecutiveLosses(makeMetrics({ consecutiveLosses: 0 }));
    expect(result.breached).toBe(false);
    expect(result.type).toBe('consecutive');
  });

  it('returns breached at exact threshold', () => {
    const metrics = makeMetrics({ consecutiveLosses: 5 });
    const result = evaluateConsecutiveLosses(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBe(0);
  });

  it('returns breached when above threshold', () => {
    const metrics = makeMetrics({ consecutiveLosses: 8 });
    const result = evaluateConsecutiveLosses(metrics);
    expect(result.breached).toBe(true);
    expect(result.headroom).toBe(-3);
  });

  it('returns not breached when one below threshold', () => {
    const metrics = makeMetrics({ consecutiveLosses: 4 });
    const result = evaluateConsecutiveLosses(metrics);
    expect(result.breached).toBe(false);
    expect(result.headroom).toBe(1);
  });

  it('reports integer headroom for consecutive losses', () => {
    const metrics = makeMetrics({ consecutiveLosses: 2 });
    const result = evaluateConsecutiveLosses(metrics);
    expect(result.headroom).toBe(3);
    expect(Number.isInteger(result.headroom)).toBe(true);
  });
});
