/**
 * Waves 220-222 Unit Test Suite:
 * - Wave 220: Gatheral & Oomen (2010) Zero-Intelligence Order Book
 * - Wave 221: Cont & Kukanov (2017) Optimal Order Placement Across Venues
 * - Wave 222: Bouchaud et al. (2004) Propagator Model of Stock Market Liquidity
 *
 * Strictly < 175 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { GatheralOomenEngine } from '../../../src/desk/gatheraloomen/gatheral-oomen-engine';
import { ContKukanovEngine } from '../../../src/desk/contkukanov/cont-kukanov-engine';
import { BouchaudPropagatorEngine } from '../../../src/desk/bouchaudpropagator/bouchaud-propagator-engine';

describe('Wave 220: Gatheral & Oomen (2010) Zero-Intelligence Order Book', () => {
  it('computes equilibrium queue depth and turnover rate', () => {
    const engine = new GatheralOomenEngine({
      limitOrderArrivalRate: 50.0,
      marketOrderArrivalRate: 20.0,
      cancellationRate: 0.1,
      tickSize: 0.01,
      baseVolatilitySigma0: 0.015,
      meanReversionKappa: 0.4,
    });
    const metrics = engine.getEquilibriumMetrics();
    expect(metrics.equilibriumDepthShares).toBe(300);
    expect(metrics.queueTurnoverRate).toBeGreaterThan(0);
    expect(metrics.expectedSpreadTicks).toBeGreaterThanOrEqual(1.0);
    expect(engine.getOptimalSamplingFrequencySec()).toBe(5.0);
  });

  it('generates high-frequency volatility signature curve', () => {
    const engine = new GatheralOomenEngine({
      limitOrderArrivalRate: 30.0,
      marketOrderArrivalRate: 15.0,
      cancellationRate: 0.05,
      tickSize: 0.01,
      baseVolatilitySigma0: 0.02,
      meanReversionKappa: 0.5,
    });
    const signature = engine.getVolatilitySignature([0.5, 2.0, 10.0]);
    expect(signature.length).toBe(3);
    // At smaller tau, microstructure noise variance ratio should be higher
    expect(signature[0].varianceRatio).toBeGreaterThan(signature[2].varianceRatio);
  });
});

describe('Wave 221: Cont & Kukanov (2017) Optimal Order Placement Across Venues', () => {
  it('allocates orders across venues balancing rebates and adverse selection', () => {
    const venues = [
      {
        venueId: 'VENUE_A_MAKER_REBATE',
        makerFeeBps: -0.20, // Rebate
        takerFeeBps: 0.30,
        queueDepthAheadShares: 2000,
        fillProbability: 0.85,
        adverseSelectionPenaltyBps: 0.10,
      },
      {
        venueId: 'VENUE_B_STANDARD',
        makerFeeBps: 0.05,
        takerFeeBps: 0.25,
        queueDepthAheadShares: 500,
        fillProbability: 0.70,
        adverseSelectionPenaltyBps: 0.05,
      },
    ];

    const engine = new ContKukanovEngine({
      venues,
      totalOrderShares: 10_000,
      adverseSelectionAversion: 1.0,
    });

    const result = engine.computeOptimalRouting();
    expect(result.totalOrderShares).toBe(10_000);
    expect(result.allocations.length).toBe(2);
    expect(engine.getTopAllocatedVenue()).toBe('VENUE_A_MAKER_REBATE');
    expect(result.effectiveRebateBps).toBeGreaterThan(0);
  });
});

describe('Wave 222: Bouchaud et al. (2004) Propagator Model of Stock Market Liquidity', () => {
  it('computes bare power-law propagator kernel with memory decay', () => {
    const engine = new BouchaudPropagatorEngine({
      bareImpactGamma0: 0.001,
      decayExponentGamma: 0.25,
      characteristicTimeScaleTau0Sec: 5.0,
      volumePowerAlpha: 0.5,
    });

    const k0 = engine.getKernelAtLag(0.0);
    const k10 = engine.getKernelAtLag(10.0);
    expect(k0).toBeGreaterThan(k10);
    expect(engine.estimatePermanentResidualImpactFraction(20.0)).toBeLessThan(1.0);
  });

  it('convolves trade events into price impact trajectory', () => {
    const engine = new BouchaudPropagatorEngine({
      bareImpactGamma0: 0.002,
      decayExponentGamma: 0.3,
      characteristicTimeScaleTau0Sec: 2.0,
      volumePowerAlpha: 0.5,
    });

    const events = [
      { timestampSec: 0.0, orderSign: 1 as const, orderVolumeShares: 100 },
      { timestampSec: 1.0, orderSign: 1 as const, orderVolumeShares: 400 },
      { timestampSec: 2.0, orderSign: -1 as const, orderVolumeShares: 200 },
    ];

    const trajectory = engine.simulateImpactTrajectory(events, [0.5, 1.5, 3.0]);
    expect(trajectory.length).toBe(3);
    // After two successive buys, impact is positive
    expect(trajectory[1].cumulativeImpactPrice).toBeGreaterThan(0);
  });
});
