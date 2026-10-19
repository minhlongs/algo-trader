import { describe, expect, it } from 'vitest';
import {
  CarteaJaimungal2016Learning,
  GatheralSchied2012Fredholm,
  ObizhaevaWang2013Supply,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 286-288 Suite', () => {
  it('Wave 286: Obizhaeva & Wang (2013) block-continuous-block optimal schedule', () => {
    const res = ObizhaevaWang2013Supply.computeObizhaevaWang2013Supply({
      totalOrderSizeQ0: 1200,
      horizonSec: 20,
      resilienceRateRho: 0.2,
      permanentImpactLambda: 0.001,
      transientImpactKappa: 0.005,
    });

    // rho * T + 2 = 0.2 * 20 + 2 = 6 => X0 = XT = 1200 / 6 = 200, nu = 0.2 * 200 = 40
    expect(res.initialImpulseBlockX0).toBeCloseTo(200, 6);
    expect(res.terminalImpulseBlockXT).toBeCloseTo(200, 6);
    expect(res.continuousInteriorRateNu).toBeCloseTo(40, 6);
    expect(
      res.initialImpulseBlockX0 + res.continuousInteriorRateNu * 20 + res.terminalImpulseBlockXT,
    ).toBeCloseTo(1200, 6);
  });

  it('Wave 287: Cartea, Jaimungal & Kinzebulatov (2016) Kalman-Bucy drift learning execution', () => {
    const res = CarteaJaimungal2016Learning.computeCartea2016LearningExecution({
      priorDriftMeanMu0: 0.0,
      priorDriftVarianceV0: 0.04,
      assetVolatilitySigma: 0.2,
      observedPriceChangeDeltaS: -1.5,
      elapsedTimeSec: 10,
      remainingTimeSec: 30,
      currentInventoryQ: 500,
      temporaryImpactEta: 0.01,
      ambiguityAversionPhi: 0.002,
    });

    expect(res.posteriorDriftMean).toBeLessThan(0);
    expect(res.posteriorDriftVariance).toBeLessThan(0.04);
    expect(res.varianceReductionRatio).toBeLessThan(1.0);
    expect(res.learningAdjustedExecutionRate).toBeGreaterThan(0);
  });

  it('Wave 288: Gatheral, Schied & Slynko (2012) discretized Fredholm integral equation solver', () => {
    const res = GatheralSchied2012Fredholm.solveGatheral2012FredholmSchedule({
      totalInventoryX0: 1000,
      horizonSec: 10,
      gridPointsN: 5,
      kernelDecayGamma: 0.5,
      regularizationDiagonalEps: 0.1,
    });

    expect(res.optimalGridTrades).toHaveLength(5);
    const sumTrades = res.optimalGridTrades.reduce((acc, v) => acc + v, 0);
    expect(sumTrades).toBeCloseTo(1000, 5);
    expect(res.isSymmetricUShape).toBe(true);
    expect(res.quadraticTransientCost).toBeGreaterThan(0);
  });
});
