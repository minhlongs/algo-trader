import { describe, expect, it } from 'vitest';
import {
  LehalleNeuman2019Book,
  CarteaJaimungalTan2016Latency,
  ObizhaevaWang2020Decomp,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 265-267 Suite', () => {
  it('Wave 265: Lehalle & Neuman (2019) Incorporating Order Book Feature in Optimal Execution', () => {
    // Simulated L2 order book imbalance series (positive = buy pressure, negative = sell pressure)
    const imbalances = [0.4, 0.3, 0.2, -0.1, -0.3, -0.4, -0.2, 0.0, 0.1, 0.0, 0.0];

    const res = LehalleNeuman2019Book.computeLehalleNeuman2019Execution(
      {
        initialInventory: 50000,
        executionHorizon: 10.0,
        steps: 10,
        temporaryImpactEta: 0.0002,
        permanentImpactGamma: 0.0001,
        riskAversionPhi: 1e-4,
        orderBookImbalanceBeta: 0.05,
      },
      imbalances,
    );

    expect(res.trajectory.length).toBe(11);
    expect(res.trajectory[0].inventory).toBe(50000);
    expect(res.terminalInventory).toBeLessThanOrEqual(500);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.averageTradingRate).toBeGreaterThan(0);

    // Monotonic inventory reduction
    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i].inventory).toBeLessThanOrEqual(res.trajectory[i - 1].inventory);
    }
  });

  it('Wave 266: Cartea, Jaimungal & Tan (2016) Market Making with Execution Delays & Latency', () => {
    const configZeroLatency = {
      latencyDelaySec: 0.0,
      intensityLambda0: 100.0,
      sensitivityKappa: 1.5,
      adverseJumpIntensityEta: 2.0,
      adverseJumpMeanSizeJ: 0.05,
      riskAversionGamma: 0.1,
      assetVolatilitySigma: 0.20,
    };

    const configWithLatency = {
      ...configZeroLatency,
      latencyDelaySec: 0.025, // 25ms colocation / cancellation delay
    };

    const quoteZero = CarteaJaimungalTan2016Latency.computeCartea2016LatencyQuote(configZeroLatency, 0);
    const quoteDelayed = CarteaJaimungalTan2016Latency.computeCartea2016LatencyQuote(configWithLatency, 0);

    // Latency widens the posted spread to protect against stale fills
    expect(quoteDelayed.totalSpread).toBeGreaterThan(quoteZero.totalSpread);
    expect(quoteDelayed.adverseSelectionPenalty).toBeGreaterThan(0);
    expect(quoteDelayed.latencyWiderRatio).toBeGreaterThan(1.0);

    // Inventory skew test: holding long inventory (q > 0) lowers bid and ask to encourage selling
    const quoteLong = CarteaJaimungalTan2016Latency.computeCartea2016LatencyQuote(configWithLatency, 5);
    expect(quoteLong.optimalHalfSpreadAsk).toBeGreaterThan(quoteLong.optimalHalfSpreadBid);
  });

  it('Wave 267: Obizhaeva, Wang & Wang (2020) High-Frequency Inventory and Information Decomposition', () => {
    const trades = [
      { size: 1000, dt: 0.5 },
      { size: 1500, dt: 0.2 },
      { size: -800, dt: 1.0 },
      { size: 2000, dt: 0.1 },
    ];

    const res = ObizhaevaWang2020Decomp.computeObizhaeva2020Decomposition(
      {
        resilienceRateRho: 1.5,
        informationWeightAlpha: 0.35, // 35% permanent informational impact, 65% transient resilience
        impactIntensityLambda: 0.0001,
        noiseVolatilitySigma: 0.02,
      },
      trades,
    );

    expect(res.steps.length).toBe(4);
    expect(res.informationalFraction).toBe(0.35);
    expect(res.cumulativePermanentImpact).toBeGreaterThan(0);
    expect(res.residualTransientImpact).toBeGreaterThan(0);

    // Check transient decay logic
    const firstStep = res.steps[0];
    expect(firstStep.bookRecoveryExpected).toBeGreaterThan(0);
  });
});
