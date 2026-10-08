import { describe, it, expect } from 'vitest';
import { CvaDvaEngine } from '../../../../src/desk/xva/cva-dva-engine';
import { FvaFundingEngine } from '../../../../src/desk/xva/fva-funding-engine';
import { BilateralNettingCalculator } from '../../../../src/desk/xva/bilateral-netting-calculator';

describe('Real-Time XVA Counterparty Risk Suite', () => {
  describe('CvaDvaEngine', () => {
    it('computes unilateral CVA, DVA and net credit valuation adjustment', () => {
      const engine = new CvaDvaEngine();

      const profile = [
        { timeYears: 1.0, expectedExposureUsd: 1_000_000, expectedNegativeExposureUsd: -500_000, discountFactor: 0.95 },
        { timeYears: 2.0, expectedExposureUsd: 800_000, expectedNegativeExposureUsd: -400_000, discountFactor: 0.90 },
      ];

      const cptyHazards = [{ timeYears: 1.0, hazardRate: 0.02 }, { timeYears: 2.0, hazardRate: 0.025 }];
      const bankHazards = [{ timeYears: 1.0, hazardRate: 0.01 }, { timeYears: 2.0, hazardRate: 0.012 }];

      const result = engine.computeCvaDva({
        exposureProfile: profile,
        counterpartyRecoveryRate: 0.40,
        bankRecoveryRate: 0.40,
        counterpartyHazardRates: cptyHazards,
        bankHazardRates: bankHazards,
      });

      expect(result.cvaUsd).toBeGreaterThan(0);
      expect(result.dvaUsd).toBeGreaterThan(0);
      expect(result.totalDefaultProbabilityPct).toBeGreaterThan(0);
      expect(result.netBilateralCreditAdjustmentUsd).toBe(Number((result.dvaUsd - result.cvaUsd).toFixed(2)));
    });

    it('rejects invalid recovery rates', () => {
      const engine = new CvaDvaEngine();
      expect(() =>
        engine.computeCvaDva({
          exposureProfile: [{ timeYears: 1.0, expectedExposureUsd: 100, expectedNegativeExposureUsd: 0, discountFactor: 1 }],
          counterpartyRecoveryRate: 1.5, // invalid
          bankRecoveryRate: 0.4,
          counterpartyHazardRates: [],
          bankHazardRates: [],
        })
      ).toThrow('Recovery rates must be between 0.0 and 1.0');
    });
  });

  describe('FvaFundingEngine', () => {
    it('computes funding costs and benefits over uncollateralized profile', () => {
      const engine = new FvaFundingEngine();

      const profile = [
        { timeYears: 0.5, expectedExposureUsd: 2_000_000, expectedNegativeExposureUsd: -1_000_000, discountFactor: 0.98 },
        { timeYears: 1.0, expectedExposureUsd: 1_500_000, expectedNegativeExposureUsd: -800_000, discountFactor: 0.96 },
      ];

      const result = engine.computeFva({
        exposureProfile: profile,
        fundingBorrowSpreadBps: 80, // 80 bps borrow spread
        fundingLendingSpreadBps: 30, // 30 bps lending spread
      });

      expect(result.fcaUsd).toBeGreaterThan(0);
      expect(result.fbaUsd).toBeGreaterThan(0);
      expect(result.netFvaUsd).toBe(Number((result.fcaUsd - result.fbaUsd).toFixed(2)));
    });
  });

  describe('BilateralNettingCalculator', () => {
    it('reduces exposure via ISDA bilateral netting and generates margin call', () => {
      const calculator = new BilateralNettingCalculator();

      const trades = [
        { tradeId: 'T1', mtmValueUsd: 5_000_000, assetClass: 'RATES' as const },
        { tradeId: 'T2', mtmValueUsd: -3_000_000, assetClass: 'FX' as const },
      ];

      const result = calculator.evaluateNettingSet({
        nettingSetId: 'NET_LEHMAN_01',
        isdaMasterActive: true,
        trades,
        postedCollateralUsd: 500_000,
        thresholdUsd: 1_000_000,
        minimumTransferAmountUsd: 100_000,
      });

      expect(result.grossPositiveExposureUsd).toBe(5_000_000);
      expect(result.nettedExposureUsd).toBe(2_000_000); // 5M - 3M
      expect(result.nettingFactor).toBe(0.4); // 2M / 5M
      expect(result.marginCallRequiredUsd).toBe(500_000); // (2M - 1M threshold) - 500k posted
    });

    it('suppresses margin call if below Minimum Transfer Amount (MTA)', () => {
      const calculator = new BilateralNettingCalculator();

      const trades = [
        { tradeId: 'T1', mtmValueUsd: 1_050_000, assetClass: 'RATES' as const },
      ];

      const result = calculator.evaluateNettingSet({
        nettingSetId: 'NET_02',
        isdaMasterActive: true,
        trades,
        postedCollateralUsd: 0,
        thresholdUsd: 1_000_000,
        minimumTransferAmountUsd: 100_000, // Unhedged is 50k < 100k MTA
      });

      expect(result.marginCallRequiredUsd).toBe(0);
    });
  });
});
