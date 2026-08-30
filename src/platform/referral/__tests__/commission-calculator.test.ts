/**
 * Commission Calculator — Unit Tests
 *
 * Covers calculateCommission, calculateCommissionWithRate, and the two
 * calendar-period helpers on CommissionCalculator. Pure-math, no DB needed;
 * the unused referralRepository import is simply stubbed so the module loads.
 * Date-dependent period math is tested via vi.setSystemTime.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../referral-repository', () => ({ referralRepository: {} }));

import { CommissionCalculator } from '../commission-calculator';

describe('CommissionCalculator', () => {
  const calc = new CommissionCalculator();

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateCommission', () => {
    it('returns revenue * 10% for positive revenue', () => {
      expect(calc.calculateCommission(1000)).toBe(100);
    });

    it('returns 0 for zero revenue', () => {
      expect(calc.calculateCommission(0)).toBe(0);
    });

    it('returns 0 for negative revenue', () => {
      expect(calc.calculateCommission(-50)).toBe(0);
    });

    it('handles fractional revenue precisely', () => {
      expect(calc.calculateCommission(33.33)).toBeCloseTo(3.333, 3);
    });
  });

  describe('calculateCommissionWithRate', () => {
    it('returns revenue * rate for positive values', () => {
      expect(calc.calculateCommissionWithRate(1000, 0.05)).toBe(50);
    });

    it('returns 0 when revenue is negative', () => {
      expect(calc.calculateCommissionWithRate(-100, 0.1)).toBe(0);
    });

    it('returns 0 when revenue is zero', () => {
      expect(calc.calculateCommissionWithRate(0, 0.1)).toBe(0);
    });

    it('returns 0 when rate is zero', () => {
      expect(calc.calculateCommissionWithRate(1000, 0)).toBe(0);
    });

    it('returns 0 when rate is negative', () => {
      expect(calc.calculateCommissionWithRate(1000, -0.1)).toBe(0);
    });
  });

  describe('getPreviousMonthPeriod', () => {
    it('returns a window spanning the whole previous month', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
      const period = calc.getPreviousMonthPeriod();
      expect(period.start.getFullYear()).toBe(2026);
      expect(period.start.getMonth()).toBe(1); // February
      expect(period.start.getDate()).toBe(1);
      expect(period.end.getMonth()).toBe(1);
      expect(period.end.getDate()).toBe(28); // Feb 2026 is non-leap
    });

    it('wraps from January back to December of the previous year', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
      const period = calc.getPreviousMonthPeriod();
      expect(period.start.getFullYear()).toBe(2025);
      expect(period.start.getMonth()).toBe(11); // December
      expect(period.end.getMonth()).toBe(11);
      expect(period.end.getDate()).toBe(31);
    });
  });

  describe('getCurrentMonthPeriod', () => {
    it('returns a window starting on the 1st of the current month', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
      const period = calc.getCurrentMonthPeriod();
      expect(period.start.getFullYear()).toBe(2026);
      expect(period.start.getMonth()).toBe(6); // July
      expect(period.start.getDate()).toBe(1);
      expect(period.end.getMonth()).toBe(6);
      expect(period.end.getDate()).toBe(31);
    });
  });
});
