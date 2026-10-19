import { describe, it, expect } from 'vitest';
import { HubermanStanzlEngine } from '../../../src/desk/hubermanstanzl';
import { GatheralSchiedGbmEngine } from '../../../src/desk/gatheralschied';
import { CarteaJaimungalLiquidationEngine } from '../../../src/desk/carteajaimungal_liquidation';

describe('Quantitative Waves 238-240 Suite', () => {
  describe('Wave 238: Huberman & Stanzl (2004) Price Manipulation & Quasi-Arbitrage', () => {
    it('should detect no quasi-arbitrage when permanent impact lambda >= 0', () => {
      const engine = new HubermanStanzlEngine({
        permanentImpactLambda: 0.05,
        temporaryImpactEta: 0.1,
      });

      // Simple round trip: buy 100 shares, then sell 100 shares
      const assessment = engine.assessRoundTrip({
        roundTripVolumes: [100, -100],
        timeStepDeltaT: 1.0,
      });

      // Round trip expected revenue must be <= 0 under positive lambda and eta
      expect(assessment.isQuasiArbitrageFree).toBe(true);
      expect(assessment.totalExpectedRevenue).toBeLessThanOrEqual(0);
      expect(assessment.temporaryImpactDissipationCost).toBeGreaterThan(0);
    });

    it('should flag potential arbitrage/manipulation if permanent impact is negative', () => {
      const engine = new HubermanStanzlEngine({
        permanentImpactLambda: -0.5, // Negative permanent impact allows price pumping
        temporaryImpactEta: 0.001,
      });

      const assessment = engine.assessRoundTrip({
        roundTripVolumes: [1000, -1000],
        timeStepDeltaT: 1.0,
      });

      // Negative lambda creates positive round-trip revenue (quasi-arbitrage)
      expect(assessment.isQuasiArbitrageFree).toBe(false);
      expect(assessment.totalExpectedRevenue).toBeGreaterThan(0);
    });
  });

  describe('Wave 239: Gatheral & Schied (2011) GBM Optimal Execution', () => {
    it('should generate decaying inventory path under Geometric Brownian Motion', () => {
      const engine = new GatheralSchiedGbmEngine({
        initialStockPriceS0: 100,
        annualDriftMu: 0.05,
        annualVolatilitySigma: 0.2,
        totalExecutionTimeT: 1.0,
        riskAversionFactor: 0.01,
      });

      const schedule = engine.generateSchedule(1000, 10);
      expect(schedule.timeGrid.length).toBe(11);
      expect(schedule.remainingInventory[0]).toBe(1000);
      expect(schedule.terminalInventory).toBe(0);
      expect(schedule.expectedImplementationShortfall).toBeGreaterThan(0);
    });
  });

  describe('Wave 240: Cartea & Jaimungal (2014) Target Inventory Penalties', () => {
    it('should enforce terminal inventory penalty and plan optimal trading velocity', () => {
      const engine = new CarteaJaimungalLiquidationEngine({
        runningInventoryPenaltyPhi: 0.001,
        terminalInventoryPenaltyAlpha: 100.0,
        temporaryImpactEta: 0.05,
        executionHorizonT: 1.0,
      });

      const assessment = engine.planOptimalExecution(500, 10);
      expect(assessment.timeGrid.length).toBe(11);
      expect(assessment.inventoryPath[0]).toBeCloseTo(500, 5);
      // Very high terminal penalty drives terminal inventory close to zero (< 1.0)
      const terminalInv = assessment.inventoryPath[assessment.inventoryPath.length - 1];
      expect(terminalInv).toBeLessThan(1.0);
      expect(assessment.totalExecutionCost).toBeGreaterThan(0);
    });
  });
});
