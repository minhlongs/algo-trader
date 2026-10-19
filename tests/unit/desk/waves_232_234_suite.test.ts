/**
 * Waves 232-234 Unit Test Suite:
 * - Wave 232: Gatheral, Schied & Slynko (2012) Transient Market Impact & Resilient Order Books
 * - Wave 233: Alfonsi, Fruth & Schied (2010) Optimal Execution in Non-Linear Limit Order Books
 * - Wave 234: Obizhaeva & Wang (2013) Optimal Trading with Transient Market Impact & Block Jumps
 *
 * Strictly < 135 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { GatheralSchiedEngine } from '../../../src/desk/gatheralschied/gatheral-engine';
import { AlfonsiFruthEngine } from '../../../src/desk/alfonsifruthor/alfonsi-engine';
import { ObizhaevaWangEngine } from '../../../src/desk/obizhaevawang/obizhaeva-engine';

describe('Wave 232: Gatheral, Schied & Slynko (2012) Transient Impact', () => {
  it('computes power-law decay kernel G(t) and enforces complete monotonicity', () => {
    const engine = new GatheralSchiedEngine({
      decayScaleGamma: 0.8,
      characteristicTimeTauSec: 60.0,
      powerLawAlpha: 0.5,
    });

    const g0 = engine.getKernel(0);
    const g60 = engine.getKernel(60); // 1 + 60/60 = 2 -> 0.8 / sqrt(2) = 0.565685
    const g240 = engine.getKernel(240); // 1 + 240/60 = 5 -> 0.8 / sqrt(5) = 0.35777

    expect(g0).toBeCloseTo(0.8, 4);
    expect(g60).toBeCloseTo(0.8 / Math.sqrt(2), 4);
    expect(g240).toBeCloseTo(0.8 / Math.sqrt(5), 4);

    const assessment = engine.evaluate({
      orderQuantityQ: 10_000,
      timeHorizonSecT: 600,
      discreteStepsN: 10,
    });

    expect(assessment.isCompletelyMonotone).toBe(true);
    expect(assessment.terminalKernelValue).toBeLessThan(assessment.initialKernelValue);
    expect(assessment.expectedExecutionCostEst).toBeGreaterThan(0);
  });
});

describe('Wave 233: Alfonsi, Fruth & Schied (2010) Non-Linear LOB Execution', () => {
  it('computes non-linear price impact with convex book depth exponent', () => {
    const engine = new AlfonsiFruthEngine({
      shapeScalingC: 100.0,
      shapeExponentGamma: 1.0, // quadratic antiderivative / linear density
      resilienceRateKappa: 0.05,
    });

    // S(x) = 100 x -> F(p) = 50 p^2 = D => p = sqrt(D / 50)
    const impact50 = engine.getPriceImpact(50);
    const impact200 = engine.getPriceImpact(200);

    expect(impact50).toBeCloseTo(1.0, 4);
    expect(impact200).toBeCloseTo(2.0, 4);
  });

  it('simulates order book depth depletion and resilient exponential recovery', () => {
    const engine = new AlfonsiFruthEngine({
      shapeScalingC: 50.0,
      shapeExponentGamma: 0.0, // flat book: S(x) = 50 -> p = D / 50
      resilienceRateKappa: 0.1,
    });

    const step1 = engine.step(0, { tradeSizeDeltaX: 100, elapsedTimeDeltaT: 0 });
    expect(step1.currentBookDepthD).toBe(100);
    expect(step1.instantaneousSlippage).toBeCloseTo(2.0, 4); // 100 / 50 = 2.0

    // After 10s: recovered depth = 100 * exp(-1) = 36.7879, add 50 shares
    const step2 = engine.step(step1.currentBookDepthD, { tradeSizeDeltaX: 50, elapsedTimeDeltaT: 10 });
    expect(step2.resilientDepthRecovery).toBeCloseTo(100 * Math.exp(-1), 3);
    expect(step2.currentBookDepthD).toBeCloseTo(100 * Math.exp(-1) + 50, 3);
  });
});

describe('Wave 234: Obizhaeva & Wang (2013) Optimal Trading with Block Jumps', () => {
  it('determines identical endpoint block jumps and constant interior execution rate', () => {
    const engine = new ObizhaevaWangEngine({
      instantaneousImpactLambda: 0.0001,
      resilienceRateRho: 0.02,
    });

    const schedule = engine.computeOptimalSchedule({
      totalSharesX0: 100_000,
      timeHorizonSecT: 100, // rho * T + 2 = 0.02 * 100 + 2 = 4
    });

    // Block jumps = 100,000 / 4 = 25,000
    expect(schedule.initialBlockJumpDeltaX0).toBeCloseTo(25_000, 2);
    expect(schedule.terminalBlockJumpDeltaXT).toBeCloseTo(25_000, 2);

    // Continuous rate = (0.02 * 100,000) / 4 = 500 shares/sec
    expect(schedule.continuousTradingRateV).toBeCloseTo(500, 2);
    expect(schedule.totalContinuousShares).toBeCloseTo(50_000, 2);

    // Sum of trades = 25,000 + 50,000 + 25,000 = 100,000
    const totalTraded = schedule.initialBlockJumpDeltaX0 + schedule.totalContinuousShares + schedule.terminalBlockJumpDeltaXT;
    expect(totalTraded).toBeCloseTo(100_000, 2);

    // Minimum expected cost = (0.0001 * 10^10) / (2 * 4) = 1,000,000 / 8 = 125,000
    expect(schedule.minimumExpectedCost).toBeCloseTo(125_000, 2);
  });
});
