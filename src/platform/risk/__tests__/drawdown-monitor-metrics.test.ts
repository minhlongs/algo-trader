/**
 * Drawdown Monitor Metrics Snapshot & Type Contracts Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DrawdownAlertTier,
  buildMetricsSnapshot,
  type DrawdownThresholdConfig,
  type DrawdownThresholdEvaluation,
  type DrawdownEvaluationResult,
  type DrawdownStateSnapshot,
  type DrawdownThrottleState,
  type DrawdownAlertRecord,
} from '../drawdown-monitor-types';

describe('DrawdownMonitorTypes - Metrics & Types', () => {
  describe('buildMetricsSnapshot', () => {
    const baseParams = {
      peakValue: 100,
      currentValue: 92,
      dailyStartValue: 98,
      dailyPnl: -6,
      consecutiveLosses: 3,
      isHalted: false,
    };

    it('builds correct metrics from raw values', () => {
      const metrics = buildMetricsSnapshot(baseParams);
      expect(metrics.peakValue).toBe(100);
      expect(metrics.currentValue).toBe(92);
      expect(metrics.currentDrawdown).toBeCloseTo(0.08, 6);
      expect(metrics.dailyDrawdown).toBeCloseTo(6 / 98, 6);
      expect(metrics.dailyPnl).toBe(-6);
      expect(metrics.consecutiveLosses).toBe(3);
      expect(metrics.isHalted).toBe(false);
    });

    it('uses totalDrawdown as maxDrawdown when maxDrawdownSoFar omitted', () => {
      const metrics = buildMetricsSnapshot(baseParams);
      expect(metrics.maxDrawdown).toBeCloseTo(metrics.currentDrawdown, 6);
    });

    it('uses maxDrawdownSoFar when provided', () => {
      const metrics = buildMetricsSnapshot({ ...baseParams, maxDrawdownSoFar: 0.25 });
      expect(metrics.maxDrawdown).toBe(0.25);
    });

    it('reports 0 drawdown when at peak', () => {
      const metrics = buildMetricsSnapshot({ ...baseParams, currentValue: 100, dailyStartValue: 100 });
      expect(metrics.currentDrawdown).toBe(0);
      expect(metrics.dailyDrawdown).toBe(0);
    });

    it('marks halted state correctly', () => {
      const metrics = buildMetricsSnapshot({ ...baseParams, isHalted: true });
      expect(metrics.isHalted).toBe(true);
    });

    it('handles zero peakValue (defensive)', () => {
      const metrics = buildMetricsSnapshot({ ...baseParams, peakValue: 0 });
      expect(metrics.currentDrawdown).toBe(0);
    });
  });

  describe('Type contracts', () => {
    it('DrawdownThresholdConfig satisfies expected shape', () => {
      const config: DrawdownThresholdConfig = {
        dailyDrawdownLimit: 0.03,
        totalDrawdownLimit: 0.10,
        consecutiveLossLimit: 3,
        haltOnBreach: false,
      };
      expect(config.dailyDrawdownLimit).toBeLessThan(config.totalDrawdownLimit);
    });

    it('DrawdownThresholdEvaluation has all required fields', () => {
      const eval_: DrawdownThresholdEvaluation = {
        type: 'daily',
        breached: true,
        current: 0.06,
        threshold: 0.05,
        headroom: -0.01,
      };
      expect(eval_.headroom).toBeCloseTo(eval_.threshold - eval_.current, 10);
    });

    it('DrawdownEvaluationResult contains evaluations array', () => {
      const result: DrawdownEvaluationResult = {
        evaluations: [],
        tier: DrawdownAlertTier.NORMAL,
        shouldHalt: false,
        alerts: [],
      };
      expect(result.evaluations).toHaveLength(0);
    });

    it('DrawdownStateSnapshot has all required fields', () => {
      const snapshot: DrawdownStateSnapshot = {
        currentValue: 90,
        peakValue: 100,
        consecutiveLosses: 2,
        dailyStartValue: 95,
        isHalted: false,
        snapshotAtMs: Date.now(),
      };
      expect(snapshot.snapshotAtMs).toBeGreaterThan(0);
    });

    it('DrawdownThrottleState tracks alert metadata', () => {
      const state: DrawdownThrottleState = {
        lastAlertAtMs: Date.now() - 60_000,
        alertCount: 3,
        suppressedCount: 1,
      };
      expect(state.alertCount).toBeGreaterThanOrEqual(state.suppressedCount);
    });

    it('DrawdownAlertRecord extends DrawdownAlert with platform fields', () => {
      const record: DrawdownAlertRecord = {
        type: 'total',
        threshold: 0.15,
        current: 0.16,
        triggeredAt: Date.now(),
        message: 'test',
        userId: 'user-123',
        tier: DrawdownAlertTier.CRITICAL,
        persistedAtMs: Date.now(),
      };
      expect(record.userId).toBe('user-123');
      expect(record.tier).toBe(DrawdownAlertTier.CRITICAL);
    });
  });
});
