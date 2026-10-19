import { describe, expect, it } from 'vitest';
import {
  AlfonsiSchied2012,
  CarteaJaimungal2014Alpha,
  GatheralSchied2011Kernel,
} from '../../../src/desk/index';

describe('Quantitative Desk Models (Waves 259 - 261)', () => {
  it('Wave 259: Alfonsi, Schied & Slynko (2012) Resilient Non-Linear Impact', () => {
    const impactSqrt = AlfonsiSchied2012.computeShapeImpact(100, 0.5, 1.0);
    const impactLinear = AlfonsiSchied2012.computeShapeImpact(100, 1.0, 1.0);
    expect(impactSqrt).toBe(10);
    expect(impactLinear).toBe(100);

    const trajSmall = AlfonsiSchied2012.computeAlfonsiSchiedTrajectory({
      initialPrice: 100, totalShares: 50, executionHorizon: 1.0, steps: 5, resilienceRate: 2.0, impactGamma: 0.5,
    });
    const trajLarge = AlfonsiSchied2012.computeAlfonsiSchiedTrajectory({
      initialPrice: 100, totalShares: 100, executionHorizon: 1.0, steps: 5, resilienceRate: 2.0, impactGamma: 0.5,
    });
    expect(trajSmall.totalExecutionCost).toBeGreaterThan(0);
    expect(trajLarge.totalExecutionCost).toBeGreaterThan(trajSmall.totalExecutionCost);
    expect(trajSmall.trajectory.length).toBe(5);

    const decays = AlfonsiSchied2012.simulateResilienceDecay(10, 2.0, 4, 1.5);
    expect(decays[0]).toBe(10);
    expect(decays[decays.length - 1]).toBeLessThan(decays[0]);
    expect(decays[decays.length - 1]).toBeCloseTo(10 * Math.exp(-3.0), 4);
  });

  it('Wave 260: Cartea, Jaimungal & Ricci (2014) MM with Alpha Signals', () => {
    const neutral = CarteaJaimungal2014Alpha.computeCarteaJaimungalAlphaQuotes({
      midPrice: 100, inventoryQ: 0, alphaDrift: 0, riskAversionGamma: 0.1, volatilitySigma: 0.2, fillIntensityA: 2.0, fillDecayK: 1.5,
    });
    const bullish = CarteaJaimungal2014Alpha.computeCarteaJaimungalAlphaQuotes({
      midPrice: 100, inventoryQ: 0, alphaDrift: 0.6, riskAversionGamma: 0.1, volatilitySigma: 0.2, fillIntensityA: 2.0, fillDecayK: 1.5,
    });
    expect(bullish.optimalBidSpread).toBeLessThan(neutral.optimalBidSpread);
    expect(bullish.optimalAskSpread).toBeGreaterThan(neutral.optimalAskSpread);
    expect(bullish.optimalBidPrice).toBeGreaterThan(neutral.optimalBidPrice);
    expect(bullish.fillIntensityBid).toBeGreaterThan(bullish.fillIntensityAsk);

    const longInv = CarteaJaimungal2014Alpha.computeCarteaJaimungalAlphaQuotes({
      midPrice: 100, inventoryQ: 2, alphaDrift: 0, riskAversionGamma: 0.1, volatilitySigma: 0.2, fillIntensityA: 2.0, fillDecayK: 1.5,
    });
    const shortInv = CarteaJaimungal2014Alpha.computeCarteaJaimungalAlphaQuotes({
      midPrice: 100, inventoryQ: -2, alphaDrift: 0, riskAversionGamma: 0.1, volatilitySigma: 0.2, fillIntensityA: 2.0, fillDecayK: 1.5,
    });
    expect(longInv.optimalBidSpread).toBeGreaterThan(neutral.optimalBidSpread);
    expect(longInv.optimalAskSpread).toBeLessThan(neutral.optimalAskSpread);
    expect(longInv.optimalBidSpread - neutral.optimalBidSpread).toBeCloseTo(neutral.optimalAskSpread - longInv.optimalAskSpread, 6);
    expect(shortInv.optimalAskSpread - neutral.optimalAskSpread).toBeCloseTo(neutral.optimalBidSpread - shortInv.optimalBidSpread, 6);
  });

  it('Wave 261: Gatheral, Schied & Slynko (2011) Exponential Kernel Transient Impact', () => {
    const x0 = 1000, t = 2.0, beta = 0.5, g0 = 1.2;
    const schedule = GatheralSchied2011Kernel.computeOptimalGatheralSchedule({
      initialSharesX0: x0, executionHorizonT: t, kernelScaleG0: g0, kernelDecayBeta: beta, discretizationStepsN: 10,
    });

    const expectedImpulse = x0 / (beta * t + 2);
    expect(schedule.initialImpulseV0).toBeCloseTo(expectedImpulse, 5);
    expect(schedule.finalImpulseVN).toBeCloseTo(expectedImpulse, 5);

    expect(schedule.totalLiquidatedShares).toBeCloseTo(x0, 5);
    expect(schedule.impactAccumulator[0]).toBeGreaterThan(0);

    const energy = GatheralSchied2011Kernel.verifyPositiveEnergy(
      schedule.discreteTradeSizes, schedule.discreteTimePoints, g0, beta
    );
    expect(energy.isPositiveEnergy).toBe(true);
    expect(energy.quadraticEnergy).toBeGreaterThan(0);
    expect(energy.priceManipulationFree).toBe(true);
  });
});
