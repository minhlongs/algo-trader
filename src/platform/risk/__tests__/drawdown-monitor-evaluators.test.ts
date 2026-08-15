/**
 * Drawdown Monitor Evaluators Tests
 *
 * Comprehensive unit tests for all pure evaluation functions.
 * Covers boundary conditions, edge cases, and the full evaluation pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateDailyDrawdown,
  evaluateTotalDrawdown,
  evaluateConsecutiveLosses,
  evaluateAllThresholds,
  determineAlertTier,
  shouldHaltTrading,
  buildAlerts,
  formatAlertMessage,
  formatHaltReason,
  shouldThrottleAlert,
  isWithinHaltPeriod,
  clampDrawdownValue,
  validateMetricsIntegrity,
  type HaltDecision,
} from '../drawdown-monitor-evaluators';
import { DrawdownAlertTier, DEFAULT_THRESHOLD_CONFIG, type DrawdownThresholdConfig } from '../drawdown-monitor-types';
import type { DrawdownMetrics, DrawdownThresholdEvaluation } from '../drawdown-monitor-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DrawdownMetrics> = {}): DrawdownMetrics {
  return {
    currentDrawdown: 0,
    maxDrawdown: 0,
    peakValue: 100,
    currentValue: 100,
    dailyPnl: 0,
    dailyDrawdown: 0,
    consecutiveLosses: 0,
    isHalted: false,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<DrawdownThresholdConfig> = {}): DrawdownThresholdConfig {
  return { ...DEFAULT_THRESHOLD_CONFIG, ...overrides };
}

// ── evaluateDailyDrawdown ─────────────────────────────────────────────────────

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

// ── evaluateTotalDrawdown ─────────────────────────────────────────────────────

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

// ── evaluateConsecutiveLosses ─────────────────────────────────────────────────

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

// ── determineAlertTier ────────────────────────────────────────────────────────

describe('determineAlertTier', () => {
  function makeEval(breached: boolean): DrawdownThresholdEvaluation {
    return { type: 'daily', breached, current: 0, threshold: 0, headroom: 0 };
  }

  it('returns NORMAL when no thresholds breached', () => {
    expect(determineAlertTier([makeEval(false), makeEval(false), makeEval(false)])).toBe(
      DrawdownAlertTier.NORMAL,
    );
  });

  it('returns WARNING when exactly 1 threshold breached', () => {
    expect(determineAlertTier([makeEval(true), makeEval(false), makeEval(false)])).toBe(
      DrawdownAlertTier.WARNING,
    );
  });

  it('returns CRITICAL when exactly 2 thresholds breached', () => {
    expect(determineAlertTier([makeEval(true), makeEval(true), makeEval(false)])).toBe(
      DrawdownAlertTier.CRITICAL,
    );
  });

  it('returns EMERGENCY when all 3 thresholds breached', () => {
    expect(determineAlertTier([makeEval(true), makeEval(true), makeEval(true)])).toBe(
      DrawdownAlertTier.EMERGENCY,
    );
  });

  it('returns NORMAL for empty evaluations', () => {
    expect(determineAlertTier([])).toBe(DrawdownAlertTier.NORMAL);
  });

  it('is order-independent (only breach count matters)', () => {
    const tier1 = determineAlertTier([makeEval(false), makeEval(true), makeEval(false)]);
    const tier2 = determineAlertTier([makeEval(true), makeEval(false), makeEval(false)]);
    expect(tier1).toBe(tier2);
  });
});

// ── shouldHaltTrading ─────────────────────────────────────────────────────────

describe('shouldHaltTrading', () => {
  function evals(daily: boolean, total: boolean, consecutive: boolean): DrawdownThresholdEvaluation[] {
    return [
      { type: 'daily', breached: daily, current: 0, threshold: 0, headroom: 0 },
      { type: 'total', breached: total, current: 0, threshold: 0, headroom: 0 },
      { type: 'consecutive', breached: consecutive, current: 0, threshold: 0, headroom: 0 },
    ];
  }

  it('returns no halt when no breaches and haltOnBreach is true', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(false, false, false), config);
    expect(result.halt).toBe(false);
  });

  it('returns halt when daily breached and haltOnBreach is true', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(true, false, false), config);
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('Daily');
  });

  it('returns halt when total breached and haltOnBreach is true', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(false, true, false), config);
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('Total');
  });

  it('returns halt when consecutive breached and haltOnBreach is true', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(false, false, true), config);
    expect(result.halt).toBe(true);
    expect(result.reason).toContain('consecutive');
  });

  it('returns no halt when breaches exist but haltOnBreach is false', () => {
    const config = makeConfig({ haltOnBreach: false });
    const result = shouldHaltTrading(evals(true, true, true), config);
    expect(result.halt).toBe(false);
  });

  it('returns halt when already halted regardless of breaches', () => {
    const config = makeConfig({ haltOnBreach: false });
    const result = shouldHaltTrading(evals(false, false, false), config, true);
    expect(result.halt).toBe(true);
    expect(result.reason).toBe('Already halted');
  });

  it('prefers daily breach reason over total when both breached', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(true, true, false), config);
    expect(result.reason).toContain('Daily');
  });

  it('prefers total breach reason over consecutive when both breached', () => {
    const config = makeConfig({ haltOnBreach: true });
    const result = shouldHaltTrading(evals(false, true, true), config);
    expect(result.reason).toContain('Total');
  });

  it('defaults to DEFAULT_THRESHOLD_CONFIG when config omitted', () => {
    const result = shouldHaltTrading(evals(true, false, false));
    expect(result.halt).toBe(true);
  });
});

// ── buildAlerts ───────────────────────────────────────────────────────────────

describe('buildAlerts', () => {
  function evals(...breached: boolean[]): DrawdownThresholdEvaluation[] {
    return breached.map((b, i) => ({
      type: (['daily', 'total', 'consecutive'] as const)[i],
      breached: b,
      current: 0.1,
      threshold: 0.05,
      headroom: -0.05,
    }));
  }

  it('returns empty array when no thresholds breached', () => {
    expect(buildAlerts(evals(false, false, false))).toHaveLength(0);
  });

  it('creates one alert for single breach', () => {
    const alerts = buildAlerts(evals(true, false, false));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('daily');
  });

  it('creates alerts for all breached thresholds', () => {
    const alerts = buildAlerts(evals(true, true, true));
    expect(alerts).toHaveLength(3);
    expect(alerts.map((a) => a.type)).toEqual(['daily', 'total', 'consecutive']);
  });

  it('each alert has triggeredAt timestamp', () => {
    const before = Date.now();
    const alerts = buildAlerts(evals(true, false, false));
    const after = Date.now();
    expect(alerts[0].triggeredAt).toBeGreaterThanOrEqual(before);
    expect(alerts[0].triggeredAt).toBeLessThanOrEqual(after);
  });

  it('each alert has a message', () => {
    const alerts = buildAlerts(evals(true, true, false));
    for (const alert of alerts) {
      expect(alert.message).toBeTruthy();
      expect(typeof alert.message).toBe('string');
    }
  });

  it('alert message includes percentage for daily/total', () => {
    const evaluation: DrawdownThresholdEvaluation = {
      type: 'daily',
      breached: true,
      current: 0.06,
      threshold: 0.05,
      headroom: -0.01,
    };
    const alerts = buildAlerts([evaluation]);
    expect(alerts[0].message).toContain('6.00%');
    expect(alerts[0].message).toContain('5.00%');
  });
});

// ── formatAlertMessage ────────────────────────────────────────────────────────

describe('formatAlertMessage', () => {
  it('formats daily alert with percentages', () => {
    const msg = formatAlertMessage({
      type: 'daily', breached: true, current: 0.06, threshold: 0.05, headroom: -0.01,
    });
    expect(msg).toContain('6.00%');
    expect(msg).toContain('5.00%');
    expect(msg).toContain('Daily');
  });

  it('formats total alert with percentages', () => {
    const msg = formatAlertMessage({
      type: 'total', breached: true, current: 0.18, threshold: 0.15, headroom: -0.03,
    });
    expect(msg).toContain('18.00%');
    expect(msg).toContain('15.00%');
    expect(msg).toContain('Total');
  });

  it('formats consecutive alert with counts', () => {
    const msg = formatAlertMessage({
      type: 'consecutive', breached: true, current: 7, threshold: 5, headroom: -2,
    });
    expect(msg).toContain('7');
    expect(msg).toContain('5');
    expect(msg).toContain('consecutive');
  });
});

// ── formatHaltReason ──────────────────────────────────────────────────────────

describe('formatHaltReason', () => {
  it('formats daily halt reason', () => {
    const reason = formatHaltReason({
      type: 'daily', breached: true, current: 0.06, threshold: 0.05, headroom: -0.01,
    });
    expect(reason).toContain('6.00%');
    expect(reason).toContain('Daily');
  });

  it('formats total halt reason', () => {
    const reason = formatHaltReason({
      type: 'total', breached: true, current: 0.20, threshold: 0.15, headroom: -0.05,
    });
    expect(reason).toContain('20.00%');
    expect(reason).toContain('Total');
  });

  it('formats consecutive halt reason', () => {
    const reason = formatHaltReason({
      type: 'consecutive', breached: true, current: 8, threshold: 5, headroom: -3,
    });
    expect(reason).toContain('8');
    expect(reason).toContain('consecutive');
  });
});

// ── shouldThrottleAlert ───────────────────────────────────────────────────────

describe('shouldThrottleAlert', () => {
  const THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

  it('returns false when lastAlertAtMs is 0 (no prior alert)', () => {
    expect(shouldThrottleAlert(0, Date.now(), THROTTLE_MS)).toBe(false);
  });

  it('returns false when enough time has passed', () => {
    const now = Date.now();
    const lastAlert = now - THROTTLE_MS - 1;
    expect(shouldThrottleAlert(lastAlert, now, THROTTLE_MS)).toBe(false);
  });

  it('returns true when not enough time has passed', () => {
    const now = Date.now();
    const lastAlert = now - THROTTLE_MS + 1000;
    expect(shouldThrottleAlert(lastAlert, now, THROTTLE_MS)).toBe(true);
  });

  it('returns false at exactly the throttle boundary', () => {
    const now = Date.now();
    const lastAlert = now - THROTTLE_MS;
    expect(shouldThrottleAlert(lastAlert, now, THROTTLE_MS)).toBe(false);
  });

  it('returns false for zero throttleMs (no throttling)', () => {
    expect(shouldThrottleAlert(Date.now() - 1000, Date.now(), 0)).toBe(false);
  });

  it('returns false for negative throttleMs', () => {
    expect(shouldThrottleAlert(Date.now() - 1000, Date.now(), -5000)).toBe(false);
  });

  it('defaults to 15-minute throttle', () => {
    const now = Date.now();
    const lastAlert = now - 10 * 60 * 1000; // 10 min ago
    expect(shouldThrottleAlert(lastAlert, now)).toBe(true);
  });
});

// ── isWithinHaltPeriod ────────────────────────────────────────────────────────

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

// ── clampDrawdownValue ────────────────────────────────────────────────────────

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

// ── validateMetricsIntegrity ──────────────────────────────────────────────────

describe('validateMetricsIntegrity', () => {
  it('returns empty array for valid metrics', () => {
    const errors = validateMetricsIntegrity(makeMetrics());
    expect(errors).toHaveLength(0);
  });

  it('catches zero peakValue', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ peakValue: 0 }));
    expect(errors).toContain('peakValue must be positive');
  });

  it('catches negative peakValue', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ peakValue: -10 }));
    expect(errors).toContain('peakValue must be positive');
  });

  it('catches negative currentValue', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ currentValue: -5 }));
    expect(errors).toContain('currentValue must be non-negative');
  });

  it('catches negative dailyDrawdown', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ dailyDrawdown: -0.05 }));
    expect(errors).toContain('dailyDrawdown must be in [0, 1]');
  });

  it('catches dailyDrawdown above 1', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ dailyDrawdown: 1.5 }));
    expect(errors).toContain('dailyDrawdown must be in [0, 1]');
  });

  it('catches negative currentDrawdown', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ currentDrawdown: -0.1 }));
    expect(errors).toContain('currentDrawdown must be in [0, 1]');
  });

  it('catches currentDrawdown above 1', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ currentDrawdown: 2 }));
    expect(errors).toContain('currentDrawdown must be in [0, 1]');
  });

  it('catches negative consecutiveLosses', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ consecutiveLosses: -1 }));
    expect(errors).toContain('consecutiveLosses must be a non-negative integer');
  });

  it('catches non-integer consecutiveLosses', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ consecutiveLosses: 2.5 }));
    expect(errors).toContain('consecutiveLosses must be a non-negative integer');
  });

  it('catches multiple errors simultaneously', () => {
    const errors = validateMetricsIntegrity(
      makeMetrics({ peakValue: 0, currentValue: -1, dailyDrawdown: 1.5 }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('allows currentValue of 0', () => {
    const errors = validateMetricsIntegrity(makeMetrics({ currentValue: 0 }));
    expect(errors.filter((e) => e.includes('currentValue'))).toHaveLength(0);
  });
});

// ── evaluateAllThresholds (integration) ───────────────────────────────────────

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
