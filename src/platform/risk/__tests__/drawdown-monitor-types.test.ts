/**
 * Drawdown Monitor Types Tests
 *
 * Validates type exports, helper functions, and default configs
 * from drawdown-monitor-types.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  DrawdownAlertTier,
  DEFAULT_THRESHOLD_CONFIG,
  computeDrawdownFraction,
  computeDailyDrawdownFraction,
  buildMetricsSnapshot,
  type DrawdownThresholdConfig,
  type DrawdownThresholdEvaluation,
  type DrawdownEvaluationResult,
  type DrawdownStateSnapshot,
  type DrawdownThrottleState,
  type DrawdownAlertRecord,
} from '../drawdown-monitor-types';

describe('DrawdownMonitorTypes', () => {
  // ── Enum values ──────────────────────────────────────────────────────────────

  describe('DrawdownAlertTier enum', () => {
    it('has all four tiers', () => {
      expect(DrawdownAlertTier.NORMAL).toBe('NORMAL');
      expect(DrawdownAlertTier.WARNING).toBe('WARNING');
      expect(DrawdownAlertTier.CRITICAL).toBe('CRITICAL');
      expect(DrawdownAlertTier.EMERGENCY).toBe('EMERGENCY');
    });

    it('has exactly 4 members', () => {
      const keys = Object.keys(DrawdownAlertTier).filter(
        (k) => typeof DrawdownAlertTier[k as keyof typeof DrawdownAlertTier] === 'string',
      );
      expect(keys).toHaveLength(4);
    });
  });

  // ── DEFAULT_THRESHOLD_CONFIG ─────────────────────────────────────────────────

  describe('DEFAULT_THRESHOLD_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_THRESHOLD_CONFIG.dailyDrawdownLimit).toBe(0.05);
      expect(DEFAULT_THRESHOLD_CONFIG.totalDrawdownLimit).toBe(0.15);
      expect(DEFAULT_THRESHOLD_CONFIG.consecutiveLossLimit).toBe(5);
      expect(DEFAULT_THRESHOLD_CONFIG.haltOnBreach).toBe(true);
    });

    it('daily limit is less than total limit', () => {
      expect(DEFAULT_THRESHOLD_CONFIG.dailyDrawdownLimit).toBeLessThan(
        DEFAULT_THRESHOLD_CONFIG.totalDrawdownLimit,
      );
    });

    it('consecutiveLossLimit is a positive integer', () => {
      expect(DEFAULT_THRESHOLD_CONFIG.consecutiveLossLimit).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_THRESHOLD_CONFIG.consecutiveLossLimit)).toBe(true);
    });
  });

  // ── computeDrawdownFraction ──────────────────────────────────────────────────

  describe('computeDrawdownFraction', () => {
    it('returns 0 when peak equals current (no drawdown)', () => {
      expect(computeDrawdownFraction(100, 100)).toBe(0);
    });

    it('computes 50% drawdown when current is half of peak', () => {
      expect(computeDrawdownFraction(200, 100)).toBe(0.5);
    });

    it('computes 100% drawdown when current is zero', () => {
      expect(computeDrawdownFraction(100, 0)).toBe(1);
    });

    it('returns 0 when peak is zero (avoids division by zero)', () => {
      expect(computeDrawdownFraction(0, 0)).toBe(0);
    });

    it('returns 0 when peak is negative (invalid state)', () => {
      expect(computeDrawdownFraction(-100, 50)).toBe(0);
    });

    it('returns 0 when current exceeds peak (new high)', () => {
      expect(computeDrawdownFraction(100, 150)).toBe(0);
    });

    it('handles very small values', () => {
      const result = computeDrawdownFraction(0.001, 0.0005);
      expect(result).toBeCloseTo(0.5, 6);
    });

    it('handles large values', () => {
      const result = computeDrawdownFraction(1_000_000, 850_000);
      expect(result).toBeCloseTo(0.15, 6);
    });

    it('returns 0 for NaN inputs', () => {
      expect(computeDrawdownFraction(NaN, 50)).toBe(0);
      expect(computeDrawdownFraction(100, NaN)).toBe(0);
    });
  });

  // ── computeDailyDrawdownFraction ─────────────────────────────────────────────

  describe('computeDailyDrawdownFraction', () => {
    it('returns 0 when daily start equals current', () => {
      expect(computeDailyDrawdownFraction(100, 100)).toBe(0);
    });

    it('computes correct daily drawdown', () => {
      expect(computeDailyDrawdownFraction(100, 95)).toBeCloseTo(0.05, 6);
    });

    it('returns 0 for zero dailyStartValue', () => {
      expect(computeDailyDrawdownFraction(0, 50)).toBe(0);
    });

    it('returns 0 for negative dailyStartValue', () => {
      expect(computeDailyDrawdownFraction(-100, 50)).toBe(0);
    });

    it('returns 0 when current exceeds daily start (profitable day)', () => {
      expect(computeDailyDrawdownFraction(100, 120)).toBe(0);
    });

    it('handles 100% daily loss', () => {
      expect(computeDailyDrawdownFraction(100, 0)).toBe(1);
    });

    it('returns 0 for NaN inputs', () => {
      expect(computeDailyDrawdownFraction(NaN, 50)).toBe(0);
      expect(computeDailyDrawdownFraction(100, NaN)).toBe(0);
    });
  });

  // ── buildMetricsSnapshot ─────────────────────────────────────────────────────

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

  // ── Type contract tests ──────────────────────────────────────────────────────

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
