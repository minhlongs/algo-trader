/**
 * Waves 235-237 Unit Test Suite:
 * - Wave 235: Gatheral (2010) No-Dynamic-Arbitrage & Price Manipulation
 * - Wave 236: Almgren, Thum, Hauptmann & Li (2005) Empirical Direct Estimation
 * - Wave 237: Almgren & Lorenz (2007) Bayesian Adaptive Execution
 *
 * Strictly < 135 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { GatheralManipulationEngine } from '../../../src/desk/gatheralmanipulation/gatheral-engine';
import { AlmgrenEmpiricalEngine } from '../../../src/desk/almgrenempirical/almgren-engine';
import { AlmgrenLorenzEngine } from '../../../src/desk/almgrenlorenz/lorenz-engine';

describe('Wave 235: Gatheral (2010) No-Dynamic-Arbitrage & Manipulation', () => {
  it('verifies non-negative cost for round-trip trades under exponential kernel', () => {
    const engine = new GatheralManipulationEngine({
      decayRateBeta: 0.05,
      impactGamma: 0.001,
    });

    expect(engine.getKernel(0)).toBeCloseTo(0.001, 5);
    expect(engine.getKernel(20)).toBeCloseTo(0.001 * Math.exp(-1), 5);

    // Round-trip schedule: buy 1000, buy 500, sell 1500 (sum = 0)
    const schedule = {
      trades: [1000, 500, -1500],
      stepDeltaT: 10,
    };

    const res = engine.assessRoundTrip(schedule);
    expect(res.isPriceManipulationFree).toBe(true);
    expect(res.roundTripCost).toBeGreaterThan(0);
    expect(res.maxTransientAdvantage).toBeGreaterThan(0);
  });
});

describe('Wave 236: Almgren et al. (2005) Empirical Direct Estimation', () => {
  it('estimates permanent and temporary price impact shortfall in basis points', () => {
    const engine = new AlmgrenEmpiricalEngine({
      dailyVolatilitySigma: 0.02, // 2% daily vol
      averageDailyVolumeV: 1_000_000,
      sharesOutstandingN: 50_000_000, // N/V = 50 -> (50)^0.25 ~= 2.659
      permanentFactorGamma: 0.314,
      temporaryFactorEta: 0.142,
      temporaryExponentAlpha: 0.6,
    });

    const assessment = engine.evaluate({
      totalSharesX: 50_000, // 5% of ADV
      durationDaysT: 1.0,
    });

    expect(assessment.participationRate).toBeCloseTo(0.05, 4);
    expect(assessment.permanentPriceImpactBps).toBeGreaterThan(5);
    expect(assessment.temporaryPriceImpactBps).toBeGreaterThan(2);
    expect(assessment.totalExecutionShortfallBps).toBeCloseTo(
      0.5 * assessment.permanentPriceImpactBps + assessment.temporaryPriceImpactBps,
      4
    );
  });
});

describe('Wave 237: Almgren & Lorenz (2007) Bayesian Adaptive Execution', () => {
  it('updates posterior drift and adapts execution rate via Kalman filter', () => {
    const engine = new AlmgrenLorenzEngine({
      initialPriorMeanAlpha0: 0.0,
      priorVarianceSigma0Sq: 0.04,
      priceVolatilitySigma: 0.5,
      temporaryImpactEta: 0.001,
    });

    // Positive price surge observation: +$1.0 in 1 second
    const update1 = engine.update(
      { priceChangeDeltaS: 1.0, timeElapsedDeltaT: 1.0 },
      10_000, // 10,000 shares remaining
      100 // 100 seconds remaining
    );

    // Posterior mean should shift positive
    expect(update1.posteriorMeanAlpha).toBeGreaterThan(0.0);
    // Posterior variance should decrease
    expect(update1.posteriorVarianceSigmaSq).toBeLessThan(0.04);
    expect(update1.kalmanGainK).toBeGreaterThan(0);
    // Recommended rate should be higher than baseline (10,000/100 = 100)
    expect(update1.recommendedTradingRateV).toBeGreaterThan(100);
  });
});
