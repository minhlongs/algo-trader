import { describe, it, expect } from 'vitest';
import { HazardRateBootstrapper } from '../../../../src/desk/cds/hazard-rate-bootstrapper';
import { CdsBondBasisArbitrageEngine } from '../../../../src/desk/cds/cds-bond-basis-arbitrage-engine';
import {
  CdsContractQuote,
  CashBondQuote,
} from '../../../../src/desk/cds/cds-types';

describe('Credit Default Swap (CDS) Basis Desk Suite', () => {
  describe('HazardRateBootstrapper', () => {
    it('bootstraps annualized default intensity and survival probability', () => {
      const bootstrapper = new HazardRateBootstrapper();

      const quote: CdsContractQuote = {
        referenceEntity: 'ACME_CORP',
        tenorYears: 5,
        parSpreadBps: 150, // 150 bps
        standardRecoveryRatePct: 40.0, // 40% recovery
      };

      const res = bootstrapper.bootstrapHazardRate(quote);

      // lambda = 0.0150 / 0.60 = 0.025 (2.5%)
      expect(res.hazardRateAnnualizedPct).toBeCloseTo(2.5, 2);
      expect(res.survivalProbabilityPct).toBeLessThan(100.0);
      expect(res.survivalProbabilityPct).toBeGreaterThan(80.0);
      expect(res.cumulativeDefaultProbabilityPct + res.survivalProbabilityPct).toBeCloseTo(100.0, 1);
    });

    it('generates term structure across tenors', () => {
      const bootstrapper = new HazardRateBootstrapper();
      const quotes: CdsContractQuote[] = [
        { referenceEntity: 'GOV_BOND', tenorYears: 1, parSpreadBps: 50, standardRecoveryRatePct: 40 },
        { referenceEntity: 'GOV_BOND', tenorYears: 5, parSpreadBps: 100, standardRecoveryRatePct: 40 },
      ];
      const curve = bootstrapper.generateTermStructure(quotes);
      expect(curve.length).toBe(2);
      expect(curve[0]!.survivalProbabilityPct).toBeGreaterThan(curve[1]!.survivalProbabilityPct);
    });
  });

  describe('CdsBondBasisArbitrageEngine', () => {
    it('identifies profitable negative basis cash-and-carry trade', () => {
      const engine = new CdsBondBasisArbitrageEngine();

      const cds: CdsContractQuote = {
        referenceEntity: 'CORP_XYZ',
        tenorYears: 5,
        parSpreadBps: 120, // 120 bps CDS
        standardRecoveryRatePct: 40,
      };

      const bond: CashBondQuote = {
        cusipOrIsin: 'US1234567890',
        maturityYears: 5,
        cleanPricePct: 98.5,
        couponRatePct: 5.5,
        yieldToMaturityBps: 550, // 5.50% YTM
        benchmarkSwapRateBps: 380, // 3.80% Swap Rate => ASW = 170 bps
        repoFinancingRateBps: 20, // 20 bps financing haircut
      };

      const res = engine.evaluateBasis(cds, bond);

      // ASW = 550 - 380 = 170 bps
      // Basis = CDS - ASW = 120 - 170 = -50 bps (Negative basis)
      // Net Carry = 170 - 120 - 20 = 30 bps
      expect(res.assetSwapSpreadBps).toBe(170);
      expect(res.basisBps).toBe(-50);
      expect(res.isNegativeBasisArbitrage).toBe(true);
      expect(res.netCarrySpreadBps).toBe(30);
      expect(res.annualArbitrageProfitUsdPer10M).toBe(30000); // 30 bps on 10M = $30,000
    });
  });
});
