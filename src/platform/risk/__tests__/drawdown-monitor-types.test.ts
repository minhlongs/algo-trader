/**
 * Drawdown Monitor Types Tests
 *
 * Validates enum values, default threshold config, and fraction calculations.
 */

import { describe, it, expect } from 'vitest';
import {
  DrawdownAlertTier,
  DEFAULT_THRESHOLD_CONFIG,
  computeDrawdownFraction,
  computeDailyDrawdownFraction,
} from '../drawdown-monitor-types';

describe('DrawdownMonitorTypes - Enums & Calculations', () => {
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
});
