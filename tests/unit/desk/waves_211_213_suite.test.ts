/**
 * Zero-mock unit test suite for Quantitative Desk Waves 211-213.
 *
 * Tests:
 * - Wave 211: Bouchaud, Mézard & Potters (2004) Propagator Model of Transient Impact
 * - Wave 212: Jaisson & Rosenbaum (2015, 2016) Rough Heston Hawkes Limit
 * - Wave 213: Cartea & Jaimungal (2014) Market Making with Execution Penalty & Drift
 *
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { PropagatorEngine, computeKernelProfile, computeEfficiencyBalance } from '../../../src/desk/propagator';
import { RoughHestonEngine, computeHurstParameter, computeFractionalKernel } from '../../../src/desk/roughheston';
import { CarteaJaimungalEngine, calculateRiccatiCoefficient } from '../../../src/desk/carteajaimungal';

describe('Wave 211: Bouchaud et al. (2004) Propagator Model', () => {
  it('computes power-law decay impact kernel and tests efficiency balance', () => {
    const kernel = computeKernelProfile({ gamma0: 0.1, decayExponent: 0.3, maxLag: 10 });
    expect(kernel.length).toBe(10);
    expect(kernel[0]).toBeCloseTo(0.1, 5);
    expect(kernel[9]).toBeLessThan(kernel[0]);

    const balance = computeEfficiencyBalance(0.3, 0.7);
    expect(balance.efficiencyIndex).toBe(1.0);
    expect(balance.isSubDiffusive).toBe(false);

    const subDiff = computeEfficiencyBalance(0.2, 0.6);
    expect(subDiff.isSubDiffusive).toBe(true);
  });

  it('evaluates single asset transient return and cross-asset spillovers', () => {
    const engine = new PropagatorEngine({ gamma0: 0.05, decayExponent: 0.25, maxLag: 20 });
    const orderSigns = [1, 1, 1, -1, 1, -1, 1, 1, 1, 1]; // Net buyer pressure
    const single = engine.evaluateSingleAsset(orderSigns);

    expect(single.predictedReturn).toBeGreaterThan(0);
    expect(single.effectiveSpreadCost).toBeGreaterThan(0);
    expect(single.decayProfile.length).toBe(10);

    const cross = engine.evaluateCrossImpact(
      {
        assets: ['BTC', 'ETH'],
        crossCoefficients: [
          [1.0, 0.35],
          [0.25, 0.9],
        ],
        decayExponent: 0.3,
        maxLag: 5,
      },
      {
        BTC: [1, 1, 1, 1, 1],
        ETH: [-1, -1, 1, -1, 1],
      }
    );

    expect(cross.predictedReturns['BTC']).toBeGreaterThan(0);
    expect(cross.spilloverIntensity).toBeGreaterThan(0);
    expect(cross.dominantDriver).toBe('BTC');
  });
});

describe('Wave 212: Jaisson & Rosenbaum (2015, 2016) Rough Heston Limit', () => {
  it('evaluates Hurst parameter and fractional memory kernel', () => {
    const H = computeHurstParameter(0.65);
    expect(H).toBeCloseTo(0.15, 3);
    expect(H).toBeLessThan(0.5);

    const kernel = computeFractionalKernel(0.65, 5, 0.1);
    expect(kernel.length).toBe(5);
    expect(kernel[0]).toBeGreaterThan(kernel[4]); // Singular memory decay
  });

  it('models nearly-unstable Hawkes volatility and forecasts rough trajectory', () => {
    const engine = new RoughHestonEngine({ alpha: 0.60, branchingRatio: 0.98, theta: 0.04 });
    const evalResult = engine.evaluate(0.04);

    expect(evalResult.hurstParameter).toBeCloseTo(0.10, 2);
    expect(evalResult.isRough).toBe(true);
    expect(evalResult.stabilityMargin).toBeCloseTo(0.02, 2);

    const traj = engine.forecastTrajectory(0.02, 10, 0.1);
    expect(traj.variances.length).toBe(11);
    expect(traj.integratedVariance).toBeGreaterThan(0);
    // Mean-reverting toward theta=0.04
    expect(traj.variances[10]).toBeGreaterThan(0.02);
  });
});

describe('Wave 213: Cartea & Jaimungal (2014) Market Making Engine', () => {
  it('calculates Riccati inventory penalty coefficient', () => {
    const hTau = calculateRiccatiCoefficient(0.1, 0.05, 1.0);
    expect(hTau).toBeGreaterThan(0);
  });

  it('calculates optimal bid/ask quotes with inventory skew and alpha drift', () => {
    // Zero inventory, neutral alpha
    const flatQuotes = CarteaJaimungalEngine.calculateQuotes({
      midPrice: 100.0,
      currentInventory: 0,
      timeHorizon: 1.0,
      currentTime: 0.0,
      volatility: 0.2,
      runningInventoryPenalty: 0.1,
      terminalLiquidationPenalty: 0.1,
      orderArrivalIntensity: 10.0,
      orderArrivalSensitivity: 1.5,
      alphaDrift: 0.0,
    });

    expect(flatQuotes.optimalAsk).toBeGreaterThan(100.0);
    expect(flatQuotes.optimalBid).toBeLessThan(100.0);
    expect(flatQuotes.inventorySkew).toBe(0.0);
    expect(flatQuotes.alphaTilt).toBe(0.0);

    // Long inventory (q = +5) -> pushes reservation price down, skews spreads lower
    const longQuotes = CarteaJaimungalEngine.calculateQuotes({
      midPrice: 100.0,
      currentInventory: 5,
      timeHorizon: 1.0,
      currentTime: 0.0,
      volatility: 0.2,
      runningInventoryPenalty: 0.1,
      terminalLiquidationPenalty: 0.1,
      orderArrivalIntensity: 10.0,
      orderArrivalSensitivity: 1.5,
    });

    expect(longQuotes.reservationPrice).toBeLessThan(flatQuotes.reservationPrice);
    expect(longQuotes.optimalAsk).toBeLessThan(flatQuotes.optimalAsk);
    expect(longQuotes.optimalBid).toBeLessThan(flatQuotes.optimalBid);

    // Bullish alpha drift (+0.05) -> tilts reservation price and quotes up
    const bullQuotes = CarteaJaimungalEngine.calculateQuotes({
      midPrice: 100.0,
      currentInventory: 0,
      timeHorizon: 1.0,
      currentTime: 0.0,
      volatility: 0.2,
      runningInventoryPenalty: 0.1,
      terminalLiquidationPenalty: 0.1,
      orderArrivalIntensity: 10.0,
      orderArrivalSensitivity: 1.5,
      alphaDrift: 0.05,
    });

    expect(bullQuotes.alphaTilt).toBeGreaterThan(0);
    expect(bullQuotes.reservationPrice).toBeGreaterThan(flatQuotes.reservationPrice);
  });
});
