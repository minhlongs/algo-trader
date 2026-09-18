/**
 * Drawdown Monitor — Alert Formatting & Throttling Tests
 * Covers: buildAlerts, formatAlertMessage, formatHaltReason, shouldThrottleAlert (19 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  buildAlerts,
  formatAlertMessage,
  formatHaltReason,
  shouldThrottleAlert,
} from '../drawdown-monitor-evaluators';
import type { DrawdownThresholdEvaluation } from '../drawdown-monitor-types';

function evals(...breached: boolean[]): DrawdownThresholdEvaluation[] {
  return breached.map((b, i) => ({
    type: (['daily', 'total', 'consecutive'] as const)[i],
    breached: b,
    current: 0.1,
    threshold: 0.05,
    headroom: -0.05,
  }));
}

describe('buildAlerts', () => {
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
      type: 'daily', breached: true, current: 0.06, threshold: 0.05, headroom: -0.01,
    };
    const alerts = buildAlerts([evaluation]);
    expect(alerts[0].message).toContain('6.00%');
    expect(alerts[0].message).toContain('5.00%');
  });
});

describe('formatAlertMessage', () => {
  it('formats daily alert with percentages', () => {
    const msg = formatAlertMessage({ type: 'daily', breached: true, current: 0.06, threshold: 0.05, headroom: -0.01 });
    expect(msg).toContain('6.00%');
    expect(msg).toContain('5.00%');
    expect(msg).toContain('Daily');
  });

  it('formats total alert with percentages', () => {
    const msg = formatAlertMessage({ type: 'total', breached: true, current: 0.18, threshold: 0.15, headroom: -0.03 });
    expect(msg).toContain('18.00%');
    expect(msg).toContain('15.00%');
    expect(msg).toContain('Total');
  });

  it('formats consecutive alert with counts', () => {
    const msg = formatAlertMessage({ type: 'consecutive', breached: true, current: 7, threshold: 5, headroom: -2 });
    expect(msg).toContain('7');
    expect(msg).toContain('5');
    expect(msg).toContain('consecutive');
  });
});

describe('formatHaltReason', () => {
  it('formats daily halt reason', () => {
    const reason = formatHaltReason({ type: 'daily', breached: true, current: 0.06, threshold: 0.05, headroom: -0.01 });
    expect(reason).toContain('6.00%');
    expect(reason).toContain('Daily');
  });

  it('formats total halt reason', () => {
    const reason = formatHaltReason({ type: 'total', breached: true, current: 0.20, threshold: 0.15, headroom: -0.05 });
    expect(reason).toContain('20.00%');
    expect(reason).toContain('Total');
  });

  it('formats consecutive halt reason', () => {
    const reason = formatHaltReason({ type: 'consecutive', breached: true, current: 8, threshold: 5, headroom: -3 });
    expect(reason).toContain('8');
    expect(reason).toContain('consecutive');
  });
});

describe('shouldThrottleAlert', () => {
  const THROTTLE_MS = 15 * 60 * 1000;

  it('returns false when lastAlertAtMs is 0 (no prior alert)', () => {
    expect(shouldThrottleAlert(0, Date.now(), THROTTLE_MS)).toBe(false);
  });

  it('returns false when enough time has passed', () => {
    const now = Date.now();
    expect(shouldThrottleAlert(now - THROTTLE_MS - 1, now, THROTTLE_MS)).toBe(false);
  });

  it('returns true when not enough time has passed', () => {
    const now = Date.now();
    expect(shouldThrottleAlert(now - THROTTLE_MS + 1000, now, THROTTLE_MS)).toBe(true);
  });

  it('returns false at exactly the throttle boundary', () => {
    const now = Date.now();
    expect(shouldThrottleAlert(now - THROTTLE_MS, now, THROTTLE_MS)).toBe(false);
  });

  it('returns false for zero throttleMs (no throttling)', () => {
    expect(shouldThrottleAlert(Date.now() - 1000, Date.now(), 0)).toBe(false);
  });

  it('returns false for negative throttleMs', () => {
    expect(shouldThrottleAlert(Date.now() - 1000, Date.now(), -5000)).toBe(false);
  });

  it('defaults to 15-minute throttle', () => {
    const now = Date.now();
    expect(shouldThrottleAlert(now - 10 * 60 * 1000, now)).toBe(true);
  });
});
