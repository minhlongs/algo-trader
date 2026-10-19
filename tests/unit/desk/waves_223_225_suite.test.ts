/**
 * Waves 223-225 Unit Test Suite:
 * - Wave 223: Guéant (2015) Accelerated Share Repurchase (ASR) Optimal Execution
 * - Wave 224: Cartea, Jaimungal & Ricci (2014) Algorithmic Trading with Cross-Asset Signals
 * - Wave 225: Donier et al. (2015) Fully Consistent Dynamical Theory of Market Impact
 *
 * Strictly < 140 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { GueantAsrEngine } from '../../../src/desk/gueantasr/gueant-asr-engine';
import { CarteaCrossAssetEngine } from '../../../src/desk/carteacrossasset/cartea-cross-asset-engine';
import { DonierImpactEngine } from '../../../src/desk/donierimpact/donier-impact-engine';

describe('Wave 223: Guéant (2015) Accelerated Share Repurchase (ASR) Execution', () => {
  it('computes characteristic rate kappa and hyperbolic optimal execution velocity', () => {
    const engine = new GueantAsrEngine({
      totalSharesX0: 10_000,
      horizonSec: 300,
      temporaryImpactEta: 0.01,
      inventoryRiskGamma: 0.001,
      volatilitySigma: 0.01,
    });

    const kappa = engine.getCharacteristicRateKappa();
    expect(kappa).toBeGreaterThan(0);

    const v0 = engine.getOptimalVelocity(0);
    const vHalf = engine.getOptimalVelocity(150);
    const vEnd = engine.getOptimalVelocity(300);

    // In ASR with terminal target, execution is smooth and decelerates towards horizon
    expect(v0).toBeGreaterThan(vHalf);
    expect(vHalf).toBeGreaterThan(vEnd);
  });

  it('generates full trajectory with remaining shares monotonically decreasing', () => {
    const engine = new GueantAsrEngine({
      totalSharesX0: 50_000,
      horizonSec: 1000,
      temporaryImpactEta: 0.0002,
      inventoryRiskGamma: 0.0001,
      volatilitySigma: 0.015,
    });

    const trajectory = engine.generateTrajectory([0, 250, 500, 750, 1000]);
    expect(trajectory.length).toBe(5);
    expect(trajectory[0].remainingShares).toBe(50_000);
    expect(trajectory[4].remainingShares).toBe(0);
    expect(trajectory[1].remainingShares).toBeLessThan(trajectory[0].remainingShares);
  });
});

describe('Wave 224: Cartea, Jaimungal & Ricci (2014) Algorithmic Trading with Cross-Asset Signals', () => {
  it('adjusts quotes symmetrically under zero inventory and zero alpha', () => {
    const engine = new CarteaCrossAssetEngine({
      inventoryAversionGamma: 0.1,
      orderIntensityKappa: 1.5,
      volatilitySigma: 0.01,
      halfSpreadBase: 0.02,
    });

    const quotes = engine.getOptimalQuotes(0, 0);
    expect(quotes.netQuoteBias).toBeCloseTo(0, 3);
    expect(engine.getNetSpread(0, 0)).toBeGreaterThan(0.04);
  });

  it('skews quotes toward buying when cross-asset alpha is strongly positive', () => {
    const engine = new CarteaCrossAssetEngine({
      inventoryAversionGamma: 0.05,
      orderIntensityKappa: 1.0,
      volatilitySigma: 0.02,
      halfSpreadBase: 0.01,
    });

    const quotesPositiveAlpha = engine.getOptimalQuotes(0, 0.005);
    // Positive alpha should increase bidSpread (or raise bid price closer to mid) and decrease askSpread
    expect(quotesPositiveAlpha.recommendedMidAdjustment).toBeGreaterThan(0);
  });
});

describe('Wave 225: Donier et al. (2015) Fully Consistent Dynamical Theory of Market Impact', () => {
  it('computes square-root impact in normal liquidity regime', () => {
    const engine = new DonierImpactEngine({
      dailyVolatilitySigma: 0.02,
      dailyVolumeV: 1_000_000,
      dimensionlessYFactor: 0.5,
      latentLiquidityDensityRho: 100,
      orderFluxJ: 500,
    });

    const vCrit = engine.getCriticalVelocity();
    expect(vCrit).toBe(5.0); // 500 / 100 = 5 shares/sec

    // Execute 10,000 shares over 5,000 sec -> v = 2 shares/sec (< vCrit)
    const assessment = engine.evaluateExecution(10_000, 5_000);
    expect(assessment.isEndogenousLiquidityHoleTriggered).toBe(false);
    expect(assessment.squareRootImpactFraction).toBeGreaterThan(0);
  });

  it('triggers endogenous liquidity hole and excessive slippage when velocity exceeds critical threshold', () => {
    const engine = new DonierImpactEngine({
      dailyVolatilitySigma: 0.02,
      dailyVolumeV: 1_000_000,
      dimensionlessYFactor: 0.5,
      latentLiquidityDensityRho: 100,
      orderFluxJ: 500,
    });

    // Execute 10,000 shares over 1,000 sec -> v = 10 shares/sec (> vCrit 5)
    const assessment = engine.evaluateExecution(10_000, 1_000);
    expect(assessment.isEndogenousLiquidityHoleTriggered).toBe(true);
    expect(assessment.effectiveSlippageBps).toBeGreaterThan(assessment.squareRootImpactFraction * 10_000);
  });
});
