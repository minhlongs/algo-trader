/**
 * Waves 241-243 Test Suite
 * Covers:
 * - Wave 241: Almgren & Chriss (2000) Non-Linear Power-Law Execution
 * - Wave 242: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernels
 * - Wave 243: Avellaneda & Stoikov (2008) Multi-Asset Spread Quoting Engine
 * Strictly zero mocks, < 120 LOC.
 */

import { describe, it, expect } from 'vitest';
import { AlmgrenPowerLawEngine } from '../../../src/desk/almgrenpowerlaw';
import { GatheralArbitrageKernelEngine } from '../../../src/desk/gatheralarbitragekernel';
import { AvellanedaMultiAssetEngine } from '../../../src/desk/avellanedamultiasset';

describe('Quantitative Desk Waves 241-243 Suite', () => {
  describe('Wave 241: Almgren & Chriss Power-Law Execution', () => {
    it('should generate monotonic decaying inventory path under power-law impact', () => {
      const engine = new AlmgrenPowerLawEngine({
        totalInventoryX0: 1000,
        timeHorizonT: 1.0,
        temporaryImpactEta: 0.05,
        powerExponentDelta: 0.5, // square-root impact
        riskAversionLambda: 1e-4,
        priceVolatilitySigma: 0.2,
      });

      const schedule = engine.generateSchedule(10);
      expect(schedule.timeGrid.length).toBe(11);
      expect(schedule.inventoryPath[0]).toBe(1000);
      expect(schedule.inventoryPath[schedule.inventoryPath.length - 1]).toBe(0);
      expect(schedule.expectedShortfall).toBeGreaterThan(0);
      expect(schedule.totalCostOfRisk).toBeGreaterThan(0);
    });
  });

  describe('Wave 242: Gatheral No-Dynamic-Arbitrage Decay Kernels', () => {
    it('should guarantee non-negative round-trip costs under completely monotone decay', () => {
      const engine = new GatheralArbitrageKernelEngine({
        kernelType: 'POWER_LAW',
        gammaScale: 0.1,
        decayRateAlpha: 0.5,
        offsetC: 0.1,
      });

      // Round-trip strategy: buy 100, sell 100
      const assessment = engine.testArbitrageFreeStrategy({
        tradeSteps: [100, -100],
        deltaT: 1.0,
      });

      expect(assessment.isArbitrageFree).toBe(true);
      expect(assessment.isCompletelyMonotone).toBe(true);
      expect(assessment.roundTripTotalCost).toBeGreaterThanOrEqual(0);
      expect(assessment.peakTransientImpact).toBeGreaterThan(0);
    });

    it('should calculate positive decay kernel values over time', () => {
      const engine = new GatheralArbitrageKernelEngine({
        kernelType: 'EXPONENTIAL',
        gammaScale: 0.2,
        decayRateAlpha: 1.5,
      });

      const k0 = engine.getKernelValue(0);
      const k1 = engine.getKernelValue(1.0);
      expect(k0).toBeCloseTo(0.2, 5);
      expect(k1).toBeLessThan(k0);
      expect(k1).toBeGreaterThan(0);
    });
  });

  describe('Wave 243: Avellaneda & Stoikov Multi-Asset Quoting', () => {
    it('should calculate reservation prices and cross-asset inventory adjustments', () => {
      const engine = new AvellanedaMultiAssetEngine({
        riskAversionGamma: 0.1,
        terminalTimeT: 1.0,
        orderBookLiquidityKappas: [1.5, 1.5],
        assetVolatilities: [0.3, 0.25],
        assetCorrelationRho: 0.7, // positive correlation
      });

      // Holding positive inventory in asset 2 should depress reservation price of asset 1
      const quotes = engine.calculateQuotes({
        currentPrices: [100, 50],
        currentInventories: [0, 10], // long asset 2
        currentTimeT: 0,
      });

      expect(quotes.reservationPrices[0]).toBeLessThan(100);
      expect(quotes.optimalBidQuotes[0]).toBeLessThan(quotes.reservationPrices[0]);
      expect(quotes.optimalAskQuotes[0]).toBeGreaterThan(quotes.reservationPrices[0]);
      expect(quotes.crossAssetInventoryAdjustment[0]).toBeGreaterThan(0);
    });
  });
});
