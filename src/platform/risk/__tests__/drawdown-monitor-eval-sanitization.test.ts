/**
 * Drawdown Monitor — Time Window, Clamping & Integrity Sanitization Tests
 * Covers: isWithinHaltPeriod (6), clampDrawdownValue (8), validateMetricsIntegrity (12) (26 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  isWithinHaltPeriod,
  clampDrawdownValue,
  validateMetricsIntegrity,
} from '../drawdown-monitor-evaluators';
import { makeMetrics } from './drawdown-monitor-evaluators-fixtures';

describe('isWithinHaltPeriod', () => {
  it('returns true for undefined haltedUntilMs (indefinite halt)', () => {
    expect(isWithinHaltPeriod(undefined, Date.now())).toBe(true);
  });

  it('returns true when now is before haltedUntilMs', () => {
    const now = Date.now();
    expect(isWithinHaltPeriod(now + 60_000, now)).toBe(true);
  });

  it('returns false when now is after haltedUntilMs', () => {
    const now = Date.now();
    expect(isWithinHaltPeriod(now - 60_000, now)).toBe(false);
  });

  it('returns false at exactly haltedUntilMs', () => {
    const now = Date.now();
    expect(isWithinHaltPeriod(now, now)).toBe(false);
  });

  it('returns false for zero haltedUntilMs', () => {
    expect(isWithinHaltPeriod(0, Date.now())).toBe(false);
  });

  it('returns false for negative haltedUntilMs', () => {
    expect(isWithinHaltPeriod(-1000, Date.now())).toBe(false);
  });
});

describe('clampDrawdownValue', () => {
  it('clamps negative to 0', () => {
    expect(clampDrawdownValue(-0.1)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clampDrawdownValue(1.5)).toBe(1);
  });

  it('passes through valid values unchanged', () => {
    expect(clampDrawdownValue(0.5)).toBe(0.5);
  });

  it('returns 0 for NaN', () => {
    expect(clampDrawdownValue(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(clampDrawdownValue(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(clampDrawdownValue(-Infinity)).toBe(0);
  });

  it('passes through 0', () => {
    expect(clampDrawdownValue(0)).toBe(0);
  });

  it('passes through 1', () => {
    expect(clampDrawdownValue(1)).toBe(1);
  });
});

describe('validateMetricsIntegrity', () => {
  it('returns empty array for valid metrics', () => {
    expect(validateMetricsIntegrity(makeMetrics())).toHaveLength(0);
  });

  it('catches zero peakValue', () => {
    expect(validateMetricsIntegrity(makeMetrics({ peakValue: 0 }))).toContain('peakValue must be positive');
  });

  it('catches negative peakValue', () => {
    expect(validateMetricsIntegrity(makeMetrics({ peakValue: -10 }))).toContain('peakValue must be positive');
  });

  it('catches negative currentValue', () => {
    expect(validateMetricsIntegrity(makeMetrics({ currentValue: -5 }))).toContain('currentValue must be non-negative');
  });

  it('catches negative dailyDrawdown', () => {
    expect(validateMetricsIntegrity(makeMetrics({ dailyDrawdown: -0.05 }))).toContain('dailyDrawdown must be in [0, 1]');
  });

  it('catches dailyDrawdown above 1', () => {
    expect(validateMetricsIntegrity(makeMetrics({ dailyDrawdown: 1.5 }))).toContain('dailyDrawdown must be in [0, 1]');
  });

  it('catches negative currentDrawdown', () => {
    expect(validateMetricsIntegrity(makeMetrics({ currentDrawdown: -0.1 }))).toContain('currentDrawdown must be in [0, 1]');
  });

  it('catches currentDrawdown above 1', () => {
    expect(validateMetricsIntegrity(makeMetrics({ currentDrawdown: 2 }))).toContain('currentDrawdown must be in [0, 1]');
  });

  it('catches negative consecutiveLosses', () => {
    expect(validateMetricsIntegrity(makeMetrics({ consecutiveLosses: -1 }))).toContain('consecutiveLosses must be a non-negative integer');
  });

  it('catches non-integer consecutiveLosses', () => {
    expect(validateMetricsIntegrity(makeMetrics({ consecutiveLosses: 2.5 }))).toContain('consecutiveLosses must be a non-negative integer');
  });

  it('catches multiple errors simultaneously', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ peakValue: 0, currentValue: -1, dailyDrawdown: 1.5 }));
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('allows currentValue of 0', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ currentValue: 0 }));
    expect(errors.filter((e) => e.includes('currentValue'))).toHaveLength(0);
  });
});
