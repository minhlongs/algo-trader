import { describe, it, expect } from 'vitest';
import {
  calcTakerFeePerShare,
  calcMakerRebatePerShare,
  calcMakerFeeRate,
  calcTakerFeeRate,
  EXEMPT_FEE_SCHEDULE,
  type PolymarketFeeSchedule,
} from '../../src/desk/polymarket/polymarket-fee-calculator';

/** Live Crypto schedule surveyed from Gamma on 2026-11-12. */
const CRYPTO: PolymarketFeeSchedule = { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2 };
/** Live Politics/Finance/Tech schedule. */
const POLITICS: PolymarketFeeSchedule = { exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 };

describe('Polymarket fee arithmetic', () => {
  describe('calcTakerFeePerShare', () => {
    it('charges rate * p * (1-p) per share, peaking at p = 0.50', () => {
      expect(calcTakerFeePerShare(CRYPTO, 0.5)).toBeCloseTo(0.0175, 10);
      expect(calcTakerFeePerShare(POLITICS, 0.5)).toBeCloseTo(0.01, 10);
    });

    it('is symmetric around 0.50', () => {
      expect(calcTakerFeePerShare(CRYPTO, 0.1)).toBeCloseTo(calcTakerFeePerShare(CRYPTO, 0.9), 12);
      expect(calcTakerFeePerShare(CRYPTO, 0.25)).toBeCloseTo(
        calcTakerFeePerShare(CRYPTO, 0.75),
        12,
      );
    });

    it('falls towards zero at the price extremes', () => {
      expect(calcTakerFeePerShare(CRYPTO, 0.01)).toBeCloseTo(0.000693, 6);
      expect(calcTakerFeePerShare(CRYPTO, 0.01)).toBeLessThan(
        calcTakerFeePerShare(CRYPTO, 0.5),
      );
    });

    it('returns 0 for an exempt schedule at every price', () => {
      for (const price of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        expect(calcTakerFeePerShare(EXEMPT_FEE_SCHEDULE, price)).toBe(0);
      }
    });

    it('returns 0 at and outside the price bounds instead of going negative', () => {
      expect(calcTakerFeePerShare(CRYPTO, 0)).toBe(0);
      expect(calcTakerFeePerShare(CRYPTO, 1)).toBe(0);
      expect(calcTakerFeePerShare(CRYPTO, -0.5)).toBe(0);
      expect(calcTakerFeePerShare(CRYPTO, 1.5)).toBe(0);
      expect(calcTakerFeePerShare(CRYPTO, Number.NaN)).toBe(0);
    });

    it('honours an exponent other than 1', () => {
      const quadratic: PolymarketFeeSchedule = { ...CRYPTO, exponent: 2 };
      // (0.5 * 0.5)^2 = 0.0625 => 0.07 * 0.0625 = 0.004375 per share.
      expect(calcTakerFeePerShare(quadratic, 0.5)).toBeCloseTo(0.07 * 0.0625, 12);
      // (0.25 * 0.75)^2 = 0.03515625 => 0.07 * 0.03515625.
      expect(calcTakerFeePerShare(quadratic, 0.25)).toBeCloseTo(0.07 * 0.1875 * 0.1875, 12);
    });
  });

  describe('calcMakerRebatePerShare', () => {
    it('returns rebateRate of the taker fee at the same price', () => {
      expect(calcMakerRebatePerShare(CRYPTO, 0.5)).toBeCloseTo(0.0175 * 0.2, 10);
      expect(calcMakerRebatePerShare(POLITICS, 0.5)).toBeCloseTo(0.01 * 0.25, 10);
    });

    it('returns 0 when the schedule pays no rebate', () => {
      const takerOnly: PolymarketFeeSchedule = { ...CRYPTO, rebateRate: 0 };
      expect(calcMakerRebatePerShare(takerOnly, 0.5)).toBe(0);
    });

    it('returns 0 for an exempt schedule', () => {
      expect(calcMakerRebatePerShare(EXEMPT_FEE_SCHEDULE, 0.5)).toBe(0);
    });
  });

  describe('calcTakerFeeRate', () => {
    it('divides the per-share fee by the USDC paid per share', () => {
      // 0.0175 USDC per share at a price of 0.50 => 3.5% of notional.
      expect(calcTakerFeeRate(CRYPTO, 0.5)).toBeCloseTo(0.035, 10);
      expect(calcTakerFeeRate(POLITICS, 0.5)).toBeCloseTo(0.02, 10);
    });

    it('equals rate * (1-p) for a linear curve', () => {
      expect(calcTakerFeeRate(CRYPTO, 0.1)).toBeCloseTo(0.07 * 0.9, 12);
      expect(calcTakerFeeRate(CRYPTO, 0.9)).toBeCloseTo(0.07 * 0.1, 12);
    });

    it('returns 0 when the price is not positive', () => {
      expect(calcTakerFeeRate(CRYPTO, 0)).toBe(0);
      expect(calcTakerFeeRate(EXEMPT_FEE_SCHEDULE, 0.5)).toBe(0);
    });
  });

  describe('calcMakerFeeRate', () => {
    it('is a negative rate, i.e. a credit to the maker', () => {
      const rate = calcMakerFeeRate(CRYPTO, 0.5);
      expect(rate).toBeLessThan(0);
      expect(rate).toBeCloseTo(-(0.0175 * 0.2) / 0.5, 12);
    });

    it('returns 0 when the price is not positive rather than dividing by zero', () => {
      expect(calcMakerFeeRate(CRYPTO, 0)).toBe(0);
    });

    it('returns 0 for an exempt schedule', () => {
      expect(calcMakerFeeRate(EXEMPT_FEE_SCHEDULE, 0.5)).toBe(0);
    });
  });

  describe('report reconciliation', () => {
    it('reproduces the report fee table for 100 shares at p = 0.50', () => {
      const notional = 100 * 0.5;
      const fee = (schedule: PolymarketFeeSchedule) =>
        notional * calcTakerFeeRate(schedule, 0.5);

      expect(fee({ ...CRYPTO, rate: 0.07 })).toBeCloseTo(1.75, 10);
      expect(fee({ ...CRYPTO, rate: 0.05 })).toBeCloseTo(1.25, 10);
      expect(fee({ ...POLITICS, rate: 0.04 })).toBeCloseTo(1.0, 10);
      expect(fee(EXEMPT_FEE_SCHEDULE)).toBe(0);
    });
  });
});
