import { describe, expect, it } from 'vitest';
import {
  AlfonsiSchiedSlynko2012Positive,
  CarteaDonnellyJaimungal2017Uncertainty,
  GatheralSchied2011Gbm,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 289-291 Suite', () => {
  it('Wave 289: Gatheral & Schied (2011) GBM optimal execution schedule', () => {
    const res = GatheralSchied2011Gbm.computeGatheralSchied2011Gbm({
      initialInventoryX0: 1000,
      initialSpotPriceS0: 100,
      geometricVolatilitySigma: 0.02,
      horizonSec: 20,
      temporaryImpactEta: 0.05,
      riskAversionLambda: 0.0005,
    });

    // dollarVariance = (0.02 * 100)^2 = 4 => kappa = sqrt(0.0005 * 4 / 0.05) = sqrt(0.04) = 0.2
    expect(res.urgencyRateKappa).toBeCloseTo(0.2, 6);
    expect(res.initialTradingRateV0).toBeGreaterThan(1000 / 20);
    expect(res.midHorizonInventory).toBeLessThan(500);
    expect(res.expectedExecutionCost).toBeGreaterThan(0);
  });

  it('Wave 290: Cartea, Donnelly & Jaimungal (2017) ambiguity-averse liquidation', () => {
    const res = CarteaDonnellyJaimungal2017Uncertainty.computeCarteaDonnellyJaimungal2017Uncertainty({
      currentInventoryQ: 600,
      remainingHorizonSec: 15,
      volatilitySigma: 0.3,
      temporaryImpactEta: 0.01,
      inventoryPenaltyPhiInv: 0.001,
      driftAmbiguityPenaltyPhiDrift: 0.04,
    });

    expect(res.robustAmbiguityRate).toBeGreaterThan(res.baselineNeutralRate);
    expect(res.worstCaseDriftAdjustment).toBeLessThan(0);
    expect(res.urgencyAccelerationRatio).toBeGreaterThan(1.0);
  });

  it('Wave 291: Alfonsi, Schied & Slynko (2012) convex resilience positive portfolio', () => {
    const res = AlfonsiSchiedSlynko2012Positive.computeAlfonsiSchiedSlynko2012Positive({
      totalOrderSizeX0: 1500,
      horizonSec: 12,
      gridStepsN: 5,
      fastResilienceRho1: 0.8,
      slowResilienceRho2: 0.15,
      fastWeightAlpha: 0.6,
    });

    expect(res.discreteTrades).toHaveLength(5);
    const total = res.discreteTrades.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1500, 6);
    expect(res.satisfiesPositivePortfolioProperty).toBe(true);
    expect(res.minimumTradeWeight).toBeGreaterThan(0);
  });
});
