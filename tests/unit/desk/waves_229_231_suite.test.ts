/**
 * Waves 229-231 Unit Test Suite:
 * - Wave 229: Bouchaud, Farmer & Lillo (2009) Metaorder Square-Root Impact & Relaxation
 * - Wave 230: Curato, Borger & Lillo (2017) Optimal Execution with Endogenous Queue Transitions
 * - Wave 231: Jaisson & Rosenbaum (2016) Microstructural Hawkes Foundations of Rough Heston
 *
 * Strictly < 135 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { BouchaudMetaorderEngine } from '../../../src/desk/bouchaudmetaorder/bouchaud-engine';
import { CuratoQueueEngine } from '../../../src/desk/curatoborgerlillo/curato-engine';
import { JaissonHawkesEngine } from '../../../src/desk/jaissonspread/jaisson-engine';

describe('Wave 229: Bouchaud, Farmer & Lillo (2009) Metaorder Impact', () => {
  it('computes square-root impact scaling with participation ratio', () => {
    const engine = new BouchaudMetaorderEngine({
      universalY: 0.6,
      dailyVolumeV: 1_000_000,
      dailyVolatilitySigma: 0.02,
      relaxationExponentBeta: 0.5,
    });

    const res = engine.evaluate({
      metaorderSharesQ: 10_000, // 1% participation
      executionDurationSecT: 3600,
    });

    // I = 0.6 * 0.02 * sqrt(0.01) = 0.012 * 0.1 = 0.0012
    expect(res.participationRatio).toBeCloseTo(0.01, 4);
    expect(res.peakImpact).toBeCloseTo(0.0012, 5);
    expect(res.permanentImpactEst).toBeCloseTo(0.0012 * (2 / 3), 5);
  });

  it('exhibits post-execution sub-linear relaxation decay', () => {
    const engine = new BouchaudMetaorderEngine({
      universalY: 0.6,
      dailyVolumeV: 1_000_000,
      dailyVolatilitySigma: 0.02,
      relaxationExponentBeta: 0.5,
    });

    const peak = 0.0012;
    const t0 = engine.getRelaxedImpact(peak, 0, 3600);
    const t1 = engine.getRelaxedImpact(peak, 3600, 3600);
    const t4 = engine.getRelaxedImpact(peak, 14400, 3600);

    expect(t0).toBe(peak);
    // At t = T = 3600: R(T) = I / (1 + 1^0.5) = I / 2
    expect(t1).toBeCloseTo(peak / 2, 5);
    // At t = 4T = 14400: R(4T) = I / (1 + 4^0.5) = I / 3
    expect(t4).toBeCloseTo(peak / 3, 5);
  });
});

describe('Wave 230: Curato, Borger & Lillo (2017) Endogenous Queue Dynamics', () => {
  it('evaluates fill probability decaying exponentially with queue depth', () => {
    const engine = new CuratoQueueEngine({
      cancellationRateLambda: 2.0,
      arrivalRateMu: 3.0,
      queueDepletionDecayKappa: 0.1,
      halfSpreadCostS: 0.01,
      adverseSelectionAlpha: 0.002,
    });

    const probHead = engine.getFillProbability(0);
    const probDeep = engine.getFillProbability(20);

    // base = 3 / (2 + 3) = 0.6
    expect(probHead).toBeCloseTo(0.6, 3);
    expect(probDeep).toBeLessThan(probHead);
  });

  it('switches execution decision between passive maker and aggressive taker', () => {
    const engine = new CuratoQueueEngine({
      cancellationRateLambda: 1.0,
      arrivalRateMu: 4.0,
      queueDepletionDecayKappa: 0.05,
      halfSpreadCostS: 0.02,
      adverseSelectionAlpha: 0.004,
    });

    // Favorable queue position (low latency penalty, shallow queue)
    const passiveDecision = engine.evaluateExecution({
      queuePositionAhead: 2,
      latencyPenaltyRisk: 0.001,
    });
    expect(passiveDecision.recommendedAction).toBe('POST_PASSIVE_LIMIT');

    // Extreme latency risk and deep queue
    const aggressiveDecision = engine.evaluateExecution({
      queuePositionAhead: 50,
      latencyPenaltyRisk: 0.05,
    });
    expect(aggressiveDecision.recommendedAction).toBe('SWEEP_AGGRESSIVE_MARKET');
  });
});

describe('Wave 231: Jaisson & Rosenbaum (2016) Microstructural Hawkes Rough Heston', () => {
  it('derives fractional Hurst roughness H < 0.5 from heavy-tailed Hawkes kernel', () => {
    const engine = new JaissonHawkesEngine({
      baselineIntensityLambda0: 5.0,
      branchingRatioEta: 0.96,
      memoryKernelAlpha: 0.65, // H = 0.65 - 0.5 = 0.15
    });

    expect(engine.getHurstExponent()).toBeCloseTo(0.15, 3);

    const assessment = engine.evaluate({
      pastArrivalTimesSec: [1.0, 1.2, 1.4, 1.48],
      currentEvaluationTimeSec: 1.5,
    });

    expect(assessment.isNearlyUnstable).toBe(true);
    expect(assessment.instantaneousIntensity).toBeGreaterThan(5.0);
    expect(assessment.stationaryMeanIntensity).toBeCloseTo(5.0 / (1 - 0.96), 1);
  });
});
