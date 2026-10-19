/**
 * Wave 244 - 246 Quantitative Desk Unit Tests
 *
 * Covers:
 * - Wave 244: Lehalle (2009) Volume Curve Dynamics & Intraday Trajectory
 * - Wave 245: Cartea & Jaimungal (2014) Optimal Market Making with Alpha Predictor
 * - Wave 246: Gatheral & Schied (2013) Market Impact Decay Integral Equations
 *
 * Strictly zero mocks, pure deterministic mathematics, < 110 LOC.
 */

import { describe, expect, it } from 'vitest';
import { LehalleVolumeCurveEngine } from '../../../src/desk/lehallemetric';
import { CarteaAlphaMmEngine } from '../../../src/desk/carteajaimungalalpha';
import { GatheralSchiedImpactEngine } from '../../../src/desk/gatheralschiedimpact';

describe('Quantitative Desk Waves 244 - 246 Suite', () => {
  it('Wave 244: Lehalle volume curve generates U-shaped intraday volume trajectory', () => {
    const engine = new LehalleVolumeCurveEngine({
      totalTargetVolumeV: 100000,
      timeHorizonT: 1.0,
      shapeParamAlpha: 0.6,
      shapeParamBeta: 0.8,
      noiseScalingEta: 0.05,
    });

    const trajectory = engine.generateTrajectory(10);
    expect(trajectory.buckets.length).toBe(10);
    expect(trajectory.totalScheduledVolume).toBeCloseTo(100000, 1);

    // Verify U-shape: opening and closing buckets have higher volume share than midday
    const openShare = trajectory.buckets[0].expectedVolumeShare;
    const midShare = trajectory.buckets[4].expectedVolumeShare;
    const closeShare = trajectory.buckets[9].expectedVolumeShare;

    expect(openShare).toBeGreaterThan(midShare);
    expect(closeShare).toBeGreaterThan(midShare);
    expect(trajectory.peakVolumeRatio).toBeGreaterThan(1.0);
  });

  it('Wave 245: Cartea & Jaimungal optimal quoting shifts with directional alpha signal', () => {
    // Neutral alpha baseline
    const neutralEngine = new CarteaAlphaMmEngine({
      inventoryQ: 0,
      maxInventoryLimitQBar: 10,
      riskAversionGamma: 0.1,
      orderFlowIntensityLambda: 1.5,
      fillProbabilityKappa: 1.2,
      shortTermAlphaAlpha: 0.0,
    });
    const neutralQuotes = neutralEngine.getOptimalQuotes();
    expect(neutralQuotes.bidHalfSpreadDeltaMinus).toBeCloseTo(neutralQuotes.askHalfSpreadDeltaPlus, 4);

    // Bullish alpha: bid shifts closer / ask shifts further away
    const bullishEngine = new CarteaAlphaMmEngine({
      inventoryQ: 0,
      maxInventoryLimitQBar: 10,
      riskAversionGamma: 0.1,
      orderFlowIntensityLambda: 1.5,
      fillProbabilityKappa: 1.2,
      shortTermAlphaAlpha: 0.5,
    });
    const bullishQuotes = bullishEngine.getOptimalQuotes();

    expect(bullishQuotes.bidHalfSpreadDeltaMinus).toBeLessThan(neutralQuotes.bidHalfSpreadDeltaMinus);
    expect(bullishQuotes.askHalfSpreadDeltaPlus).toBeGreaterThan(neutralQuotes.askHalfSpreadDeltaPlus);
    expect(bullishQuotes.effectiveReservationSkew).toBeGreaterThan(0);
  });

  it('Wave 246: Gatheral & Schied transient impact decay integral', () => {
    const enginePower = new GatheralSchiedImpactEngine({
      decayKernelAlpha: 0.5,
      decayType: 'POWER_LAW',
      instantaneousImpactGamma: 0.002,
    });

    const tradeHistory = [
      { timestamp: 0, tradeSize: 500 },
      { timestamp: 1, tradeSize: 300 },
      { timestamp: 2, tradeSize: 200 },
    ];

    const stateAtTime2 = enginePower.calculateImpact(tradeHistory, 2);
    expect(stateAtTime2.cumulativePriceImpact).toBeGreaterThan(0);
    expect(stateAtTime2.instantaneousPriceShift).toBeCloseTo(0.002 * 200, 5);

    // Impact decays over time
    const stateAtTime10 = enginePower.calculateImpact(tradeHistory, 10);
    expect(stateAtTime10.cumulativePriceImpact).toBeLessThan(stateAtTime2.cumulativePriceImpact);
  });
});
