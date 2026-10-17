/**
 * Zero-mock comprehensive test suite for Quantitative Desk Waves 214-216.
 *
 * Covers:
 * - Wave 214: Almgren, Thum, Hauptmann & Li (2005) Non-Linear Square-Root Impact.
 * - Wave 215: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Criteria.
 * - Wave 216: Avellaneda & Lipkin (2003) Hard-to-Borrow & Short Squeeze Dynamics.
 * Strictly < 175 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { AlmgrenThumEngine, AlmgrenThumMath } from '../../../src/desk/almgrenthum';
import { GatheralArbitrageEngine, GatheralArbitrageMath } from '../../../src/desk/gatheralarbitrage';
import { AvellanedaLipkinEngine, AvellanedaLipkinMath } from '../../../src/desk/avellanedalipkin';

describe('Quantitative Desk Waves 214-216 Suite', () => {
  describe('Wave 214: Almgren-Thum (2005) Square-Root Impact', () => {
    const config = {
      dailyVolatility: 0.02,
      averageDailyVolume: 1_000_000,
      tempImpactCoeff: 0.142,
      tempImpactExponent: 0.50,
      permImpactCoeff: 0.314,
    };

    it('should verify concave square-root impact scaling (4x speed -> 2x impact)', () => {
      const isConcave = AlmgrenThumMath.verifySquareRootScaling(config.averageDailyVolume, config.dailyVolatility);
      expect(isConcave).toBe(true);
    });

    it('should evaluate optimal execution trajectory without POV breach', () => {
      const engine = new AlmgrenThumEngine(config);
      const res = engine.evaluateExecution({
        totalShares: 50_000,
        executionHorizonDays: 1.0,
        intervals: 20,
      });

      expect(res.status).toBe('OPTIMAL_EXECUTION');
      expect(res.expectedTemporaryImpactBps).toBeGreaterThan(0);
      expect(res.expectedPermanentImpactBps).toBeGreaterThan(0);
      expect(res.totalImplementationShortfallBps).toBeGreaterThan(0);
      expect(res.trajectory.length).toBe(20);
      expect(res.trajectory[19].remainingShares).toBe(0);
    });

    it('should constrain speed and flag POV_CONSTRAINED status when capped', () => {
      const engine = new AlmgrenThumEngine(config);
      const res = engine.evaluateExecution({
        totalShares: 100_000,
        executionHorizonDays: 0.5,
        participationRateCap: 0.10, // 10% POV cap
      });

      expect(res.status).toBe('POV_CONSTRAINED');
      expect(res.maxParticipationRatePct).toBeCloseTo(10.0, 1);
    });
  });

  describe('Wave 215: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernels', () => {
    it('should verify permanent impact is unconditionally arbitrage free', () => {
      const engine = new GatheralArbitrageEngine({
        impactExponent: 0.5,
        impactMultiplier: 0.001,
        kernelType: 'PERMANENT',
        decayParameter: 0.0,
      });

      const audit = engine.auditKernelSafety();
      expect(audit.isSafe).toBe(true);
      const res = engine.evaluateRoundTrip({ shares: 10_000, horizonDays: 1.0 });
      expect(res.isDynamicArbitragePresent).toBe(false);
      expect(res.status).toBe('NO_ARBITRAGE_COMPLIANT');
    });

    it('should detect dynamic arbitrage / price manipulation under exponential decay with alpha < 1', () => {
      const engine = new GatheralArbitrageEngine({
        impactExponent: 0.5, // Sublinear impact
        impactMultiplier: 0.05,
        kernelType: 'EXPONENTIAL',
        decayParameter: 50.0, // Rapid transient decay
      });

      const audit = engine.auditKernelSafety();
      expect(audit.isSafe).toBe(false);

      const res = engine.evaluateRoundTrip({
        shares: 20_000,
        horizonDays: 1.0,
        oscillationCycles: 2,
        intervals: 100,
      });

      expect(res.isDynamicArbitragePresent).toBe(true);
      expect(res.status).toBe('DYNAMIC_ARBITRAGE_DETECTED');
      expect(res.roundTripCostBps).toBeLessThan(0); // Round-trip produces net profit!
    });

    it('should evaluate power-law decay safety bound', () => {
      const bound = GatheralArbitrageMath.getTheoreticalArbitrageBound(0.6, 'POWER_LAW');
      expect(bound).toBeCloseTo(0.4, 2); // 1 - alpha = 0.4
    });
  });

  describe('Wave 216: Avellaneda & Lipkin (2003) Short Squeeze Dynamics', () => {
    const config = {
      spotPrice: 45.0,
      freeFloatShares: 5_000_000,
      averageDailyVolume: 200_000,
      shortInterestShares: 1_800_000, // 36% SI
      annualBorrowFeeRate: 0.18,      // 18% borrow fee
      squeezeTriggerPrice: 50.0,
    };

    it('should compute days-to-cover and escalated dynamic borrow fees', () => {
      const dtc = AvellanedaLipkinMath.calculateDaysToCover(config.shortInterestShares, config.averageDailyVolume);
      expect(dtc).toBe(9.0);
      const dynFee = AvellanedaLipkinMath.calculateDynamicBorrowFee(config.annualBorrowFeeRate, 36.0);
      expect(dynFee).toBeGreaterThan(config.annualBorrowFeeRate);
    });

    it('should trigger acute short squeeze and forced buy-ins on exogenous price shock', () => {
      const engine = new AvellanedaLipkinEngine(config);
      const res = engine.evaluateSqueezeRisk({
        horizonDays: 5.0,
        intervals: 25,
        initialPriceShockPct: 20.0, // Gap above trigger 50.0 -> 54.0
      });

      expect(res.squeezeRegime).toBe('ACUTE_SHORT_SQUEEZE');
      expect(res.isSqueezeTriggered).toBe(true);
      expect(res.maxForcedBuyInSpeedSharesPerDay).toBeGreaterThan(0);
      expect(res.terminalPrice).toBeGreaterThan(res.spotPrice);
      expect(res.trajectory.length).toBe(25);
    });

    it('should remain in nominal regime when short interest and borrow fees are low', () => {
      const engine = new AvellanedaLipkinEngine({
        spotPrice: 100.0,
        freeFloatShares: 20_000_000,
        averageDailyVolume: 1_000_000,
        shortInterestShares: 500_000, // 2.5% SI, 0.5 DTC
        annualBorrowFeeRate: 0.015,   // 1.5% fee
        squeezeTriggerPrice: 120.0,
      });

      const res = engine.evaluateSqueezeRisk({
        horizonDays: 5.0,
        initialPriceShockPct: 0.0,
      });

      expect(res.squeezeRegime).toBe('NOMINAL');
      expect(res.isSqueezeTriggered).toBe(false);
    });
  });
});
