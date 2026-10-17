/**
 * Waves 226-228 Unit Test Suite:
 * - Wave 226: Mastromatteo, Toth & Bouchaud (2014) Agent-Based Microscopic Market Impact
 * - Wave 227: Gatheral & Wang (2012) Transient Market Impact Optimal Execution
 * - Wave 228: Almgren (2003) Non-Linear Power-Law Optimal Execution
 *
 * Strictly < 135 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { MastromatteoEngine } from '../../../src/desk/mastromatteo/mastromatteo-engine';
import { GatheralWangEngine } from '../../../src/desk/gatheralwang/gatheral-wang-engine';
import { AlmgrenNonLinearEngine } from '../../../src/desk/almgrennonlinear/almgren-nonlinear-engine';

describe('Wave 226: Mastromatteo, Toth & Bouchaud (2014) Microscopic Impact', () => {
  it('computes equilibrium impact under balanced order flow', () => {
    const engine = new MastromatteoEngine({
      equilibriumSpreadDelta: 0.02,
      participationAlpha: 0.5,
      latentLiquidityFractionRho: 0.2,
      baselineVolumeV0: 100_000,
      timeScaleTau: 60,
      criticalImbalanceOmega: 0.6,
    });

    const assessment = engine.evaluateImpact(500, { buyVolume: 3_000, sellVolume: 2_500 });
    expect(assessment.isEndogenousCollapseTriggered).toBe(false);
    expect(assessment.equilibriumImpact).toBeGreaterThan(0);
    expect(assessment.orderImbalanceOmega).toBeCloseTo(500 / 5500, 3);
  });

  it('triggers endogenous collapse when order flow imbalance exceeds critical threshold', () => {
    const engine = new MastromatteoEngine({
      equilibriumSpreadDelta: 0.02,
      participationAlpha: 0.5,
      latentLiquidityFractionRho: 0.2,
      baselineVolumeV0: 100_000,
      timeScaleTau: 60,
      criticalImbalanceOmega: 0.5,
    });

    // Extreme one-sided buy frenzy: 9,000 buy vs 1,000 sell -> omega = 0.8 > 0.5
    const assessment = engine.evaluateImpact(8_000, { buyVolume: 9_000, sellVolume: 1_000 });
    expect(assessment.isEndogenousCollapseTriggered).toBe(true);
    expect(assessment.effectiveSpreadCost).toBeGreaterThan(0.04);
  });
});

describe('Wave 227: Gatheral & Wang (2012) Transient Market Impact', () => {
  it('determines boundary block trade jumps and constant interior trading rate', () => {
    const engine = new GatheralWangEngine({
      totalSharesX0: 10_000,
      horizonSecT: 600,
      decayRateRho: 0.01,
      transientImpactGamma: 0.0005,
    });

    const sched = engine.getSchedule();
    // denom = 0.01 * 600 + 2 = 8
    // deltaX0 = 10,000 / 8 = 1,250
    // deltaXT = 1,250
    // vContinuous = 0.01 * 10,000 / 8 = 12.5 shares/sec
    expect(sched.initialBlockTradeShares).toBeCloseTo(1250, 1);
    expect(sched.terminalBlockTradeShares).toBeCloseTo(1250, 1);
    expect(sched.continuousTradingRatePerSec).toBeCloseTo(12.5, 1);
    expect(sched.expectedExecutionCost).toBeGreaterThan(0);
  });

  it('tracks monotonic decrease in remaining inventory across time', () => {
    const engine = new GatheralWangEngine({
      totalSharesX0: 10_000,
      horizonSecT: 600,
      decayRateRho: 0.01,
      transientImpactGamma: 0.0005,
    });

    const rem0 = engine.getRemainingSharesAt(0);
    const rem300 = engine.getRemainingSharesAt(300);
    const rem600 = engine.getRemainingSharesAt(600);

    expect(rem0).toBe(10_000);
    expect(rem300).toBeLessThan(rem0);
    expect(rem300).toBeGreaterThan(rem600);
    expect(rem600).toBe(0);
  });
});

describe('Wave 228: Almgren (2003) Non-Linear Power-Law Impact Execution', () => {
  it('calculates decelerating velocity trajectory with power-law temporary impact', () => {
    const engine = new AlmgrenNonLinearEngine({
      totalSharesX0: 50_000,
      horizonSecT: 1000,
      temporaryImpactEta: 0.002,
      powerExponentAlpha: 0.5, // Square root
      permanentImpactGamma: 0.0001,
      riskAversionLambda: 0.01,
      volatilitySigma: 0.02,
    });

    const v0 = engine.getVelocityAt(0);
    const vMid = engine.getVelocityAt(500);
    const vEnd = engine.getVelocityAt(1000);

    expect(v0).toBeGreaterThan(vMid);
    expect(vMid).toBeGreaterThan(vEnd);

    const assessment = engine.evaluate();
    expect(assessment.effectiveTemporaryImpact).toBeGreaterThan(0);
    expect(assessment.expectedTotalCost).toBeGreaterThan(0);
  });
});
