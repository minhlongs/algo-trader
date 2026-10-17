/**
 * Waves 217-219 Unit Test Suite:
 * - Wave 217: Kyle & Obizhaeva (2016) Microstructure Invariance
 * - Wave 218: Cont & de Larrard (2013) Markovian LOB Queueing
 * - Wave 219: Lehalle & Neuman (2019) Order Flow-Adjusted Execution
 *
 * Strictly < 175 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { KyleObizhaevaEngine } from '../../../src/desk/kyleobizhaeva/kyle-obizhaeva-engine';
import { ContDeLarrardEngine } from '../../../src/desk/contdelarrardqueue/cont-delarrard-engine';
import { LehalleNeumanEngine } from '../../../src/desk/lehalleneuman/lehalle-neuman-engine';

describe('Wave 217: Kyle & Obizhaeva (2016) Microstructure Invariance', () => {
  it('computes dimensional invariance metrics and bet size', () => {
    const engine = new KyleObizhaevaEngine({
      spotPrice: 150.0,
      averageDailyVolume: 1_200_000,
      dailyVolatility: 0.018,
    });
    const metrics = engine.getInvarianceMetrics();
    expect(metrics.dollarVolumeUsd).toBe(180_000_000);
    expect(metrics.tradingVelocityV).toBe(180.0);
    expect(metrics.characteristicBetSizeShares).toBeGreaterThan(0);
    expect(metrics.spreadEstimateBps).toBeGreaterThan(0);
  });

  it('correctly classifies order impact and participation rate regime', () => {
    const engine = new KyleObizhaevaEngine({
      spotPrice: 50.0,
      averageDailyVolume: 500_000,
      dailyVolatility: 0.025,
    });
    const smallOrder = engine.evaluateOrder(50);
    expect(smallOrder.invarianceScaleRegime).toBe('MICRO_ORDER');
    expect(engine.getOptimalParticipationRate(50)).toBe(0.15);

    const blockOrder = engine.evaluateOrder(50_000);
    expect(blockOrder.invarianceScaleRegime).toBe('LARGE_BLOCK');
    expect(engine.getOptimalParticipationRate(50_000)).toBe(0.03);
  });
});

describe('Wave 218: Cont & de Larrard (2013) Markovian LOB Queueing', () => {
  it('forecasts probability of price move based on queue imbalance', () => {
    const engine = new ContDeLarrardEngine({
      limitOrderArrivalRate: 15.0,
      marketOrderArrivalRate: 20.0,
      cancellationRate: 5.0,
      tickSize: 0.01,
    });
    // Deep bid (1200) vs shallow ask (300) -> price should move UP
    const upState = {
      bidQueueDepth: 1200,
      askQueueDepth: 300,
      midPrice: 100.0,
    };
    const upProb = engine.evaluateQueueState(upState);
    expect(upProb.probUpMove).toBe(0.8);
    expect(upProb.probDownMove).toBe(0.2);
    expect(upProb.orderBookImbalance).toBe(0.6);
    expect(engine.getTradingSignal(upState)).toBe('BUY_PRESSURE');
    expect(upProb.predictedNextMid).toBeGreaterThan(100.0);
  });

  it('projects queue depletion trajectory over horizon', () => {
    const engine = new ContDeLarrardEngine({
      limitOrderArrivalRate: 10.0,
      marketOrderArrivalRate: 18.0,
      cancellationRate: 2.0,
      tickSize: 0.01,
    });
    const trajectory = engine.simulateEvolution({
      bidQueueDepth: 500,
      askQueueDepth: 500,
      midPrice: 50.0,
    }, 5.0, 5);
    expect(trajectory.length).toBe(6);
    expect(trajectory[5].bidDepth).toBeLessThan(500);
  });
});

describe('Wave 219: Lehalle & Neuman (2019) Order Flow-Adjusted Execution', () => {
  it('generates optimal execution schedule with order flow drift', () => {
    const engine = new LehalleNeumanEngine({
      totalSharesToExecute: 10_000,
      timeHorizonSec: 60.0,
      riskAversionLambda: 1e-5,
      permanentImpactGamma: 2e-6,
      temporaryImpactEta: 5e-5,
      volatilitySigma: 0.2,
      orderFlowMeanReversionKappa: 0.1,
      orderFlowImpactBeta: 1e-4,
    });

    const scheduleWithFlow = engine.generateSchedule(500.0, 6);
    expect(scheduleWithFlow.trajectory.length).toBe(7);
    expect(scheduleWithFlow.trajectory[0].optimalSpeedSharesPerSec).toBeGreaterThan(0);
    expect(scheduleWithFlow.expectedExecutionCostUsd).toBeGreaterThan(0);
  });

  it('re-evaluates tactical speed as order flow evolves', () => {
    const engine = new LehalleNeumanEngine({
      totalSharesToExecute: 5_000,
      timeHorizonSec: 30.0,
      riskAversionLambda: 1e-5,
      permanentImpactGamma: 2e-6,
      temporaryImpactEta: 5e-5,
      volatilitySigma: 0.15,
      orderFlowMeanReversionKappa: 0.2,
      orderFlowImpactBeta: 1e-4,
    });
    const tacticalSpeed = engine.getTacticalSpeed(2_500, 200, 15.0);
    expect(tacticalSpeed).toBeGreaterThan(0);
  });
});
