import { describe, it, expect } from 'vitest';
import { PsaPrepaymentModel } from '../../../../src/desk/mbs/psa-prepayment-model';
import { MbsCashflowEngine } from '../../../../src/desk/mbs/mbs-cashflow-engine';
import { MbsPoolTerms } from '../../../../src/desk/mbs/mbs-types';

describe('Mortgage-Backed Securities (MBS) Prepayment Desk Suite', () => {
  describe('PsaPrepaymentModel', () => {
    it('computes CPR and SMM ramp-up under 100% PSA benchmark', () => {
      const model = new PsaPrepaymentModel();

      // Month 15: 6% * (15 / 30) = 3% CPR
      const res15 = model.computePrepaymentRate(15, 100);
      expect(res15.cprAnnualizedPct).toBe(3.0);
      expect(res15.smmMonthlyPct).toBeGreaterThan(0);
      expect(res15.smmMonthlyPct).toBeLessThan(0.30);

      // Month 30+: 6% CPR flat
      const res30 = model.computePrepaymentRate(30, 100);
      expect(res30.cprAnnualizedPct).toBe(6.0);

      const res40 = model.computePrepaymentRate(40, 100);
      expect(res40.cprAnnualizedPct).toBe(6.0);
    });

    it('scales linearly with PSA speed multiplier', () => {
      const model = new PsaPrepaymentModel();
      const res150 = model.computePrepaymentRate(30, 150); // 150% PSA = 9% CPR
      expect(res150.cprAnnualizedPct).toBe(9.0);
    });
  });

  describe('MbsCashflowEngine', () => {
    it('generates amortized cash flows, principal prepayments, and WAL', () => {
      const engine = new MbsCashflowEngine();

      const terms: MbsPoolTerms = {
        poolId: 'FNMA_30YR_6PCT',
        originalBalanceUsd: 1000000, // $1M pool
        grossCouponPct: 6.5,
        servicingFeeBps: 50, // Net 6.0% coupon
        originalMaturityMonths: 360,
        psaSpeedPct: 100,
      };

      const { schedule, summary } = engine.generateCashflows(terms);

      expect(schedule.length).toBeGreaterThan(0);
      expect(summary.totalPrincipalReceivedUsd).toBeCloseTo(1000000, -2);
      expect(summary.weightedAverageLifeYears).toBeLessThan(30.0); // Prepayments shorten WAL significantly
      expect(summary.weightedAverageLifeYears).toBeGreaterThan(5.0);
    });
  });
});
