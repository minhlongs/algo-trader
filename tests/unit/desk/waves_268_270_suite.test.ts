import { describe, expect, it } from 'vitest';
import {
  LehalleNeuman2019QueueReactive,
  CarteaJaimungal2017Ambiguity,
  GatheralSchied2013Rough,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 268-270 Suite', () => {
  it('Wave 268: Lehalle & Neuman (2019) Limit Order Book Queue-Reactive Liquidation', () => {
    const queueNormal = {
      bidQueueDepth: 10000,
      askQueueDepth: 8000,
      midPrice: 100.0,
      tickSize: 0.01,
    };

    const cfg = {
      initialInventory: 500,
      queueDepletionAlpha: 0.0005,
      marketOrderPenaltyEta: 0.002,
      passiveFillIntensityLambda: 1.2,
      adverseSelectionRiskGamma: 0.05,
    };

    const decisionNormal = LehalleNeuman2019QueueReactive.evaluateQueueReactiveLiquidation(queueNormal, 500, cfg);
    expect(decisionNormal.action).toBe('PASSIVE_POST');
    expect(decisionNormal.passiveFillProbability).toBeGreaterThan(0.5);
    expect(decisionNormal.expectedExecutionCost).toBeGreaterThan(0);

    // Test depleted bid queue forcing aggressive execution
    const queueDepleted = {
      ...queueNormal,
      bidQueueDepth: 100,
      askQueueDepth: 20000,
    };
    const decisionAggressive = LehalleNeuman2019QueueReactive.evaluateQueueReactiveLiquidation(queueDepleted, 500, cfg);
    expect(decisionAggressive.action).toBe('AGGRESSIVE_CROSS');
  });

  it('Wave 269: Cartea & Jaimungal (2017) Ambiguity-Averse Market Making', () => {
    const res = CarteaJaimungal2017Ambiguity.computeAmbiguityMarketMakingQuotes({
      riskAversionGamma: 0.1,
      ambiguityPenaltyTheta: 0.5,
      orderArrivalKappa: 1.5,
      assetVolatilitySigma: 0.2,
      inventory: 5,
    });

    expect(res.worstCaseDriftAdjustment).toBeGreaterThan(0);
    expect(res.optimalBidSpread).toBeGreaterThan(res.neutralBidSpread);
    expect(res.totalSpread).toBeGreaterThan(0);
  });

  it('Wave 270: Gatheral & Schied (2013) Fractional Brownian Motion & Rough Path Optimal Liquidation', () => {
    const res = GatheralSchied2013Rough.computeRoughLiquidation({
      initialShares: 10000,
      executionHorizon: 5.0,
      steps: 10,
      hurstParameter: 0.35, // Rough regime H in (0, 0.5)
      impactDecayKernelAlpha: -0.15,
      tempImpactEta: 0.0001,
      riskAversionLambda: 1e-4,
    });

    expect(res.effectiveHurst).toBe(0.35);
    expect(res.memoryKernelExponent).toBeCloseTo(-0.15, 4);
    expect(res.trajectory.length).toBe(11);
    expect(res.trajectory[0].inventory).toBe(10000);
    expect(res.terminalInventory).toBe(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
  });
});
