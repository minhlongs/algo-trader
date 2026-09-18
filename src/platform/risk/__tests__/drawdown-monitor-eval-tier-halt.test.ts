/**
 * Drawdown Monitor — Alert Tier & Trading Halt Tests
 * Covers: determineAlertTier (6 tests), shouldHaltTrading (9 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  determineAlertTier,
  shouldHaltTrading,
} from '../drawdown-monitor-evaluators';
import {
  DrawdownAlertTier,
  DEFAULT_THRESHOLD_CONFIG,
  type DrawdownThresholdEvaluation,
} from '../drawdown-monitor-types';
import { makeConfig, makeEval } from './drawdown-monitor-evaluators-fixtures';

function evals(daily: boolean, total: boolean, consecutive: boolean): DrawdownThresholdEvaluation[] {
  return [
    { type: 'daily', breached: daily, current: 0, threshold: 0, headroom: 0 },
    { type: 'total', breached: total, current: 0, threshold: 0, headroom: 0 },
    { type: 'consecutive', breached: consecutive, current: 0, threshold: 0, headroom: 0 },
  ];
}

describe('determineAlertTier', () => {
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

describe('shouldHaltTrading', () => {
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
