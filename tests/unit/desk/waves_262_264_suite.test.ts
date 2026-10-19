import { describe, expect, it } from 'vitest';
import {
  Gueant2015ClosedForm,
  LopezDePrado2018FracDiff,
  AlmgrenLi2016Option,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 262-264 Suite', () => {
  it('Wave 262: Guéant (2015) Closed-Form Approximations in Optimal Liquidation', () => {
    const res = Gueant2015ClosedForm.computeGueant2015Trajectory({
      initialShares: 100000,
      executionHorizon: 10.0,
      steps: 10,
      impactAlpha: 1.0,
      impactEta: 0.0001,
      riskAversion: 1e-4,
      volatility: 0.02,
    });

    expect(res.powerExponent).toBe(2.0); // (1 + 1)/1 = 2
    expect(res.trajectory.length).toBe(11);
    expect(res.trajectory[0].inventory).toBe(100000);
    expect(res.terminalInventory).toBe(0);
    expect(res.totalSlippageCost).toBeGreaterThan(0);

    // Monotonic inventory liquidation verification
    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i].inventory).toBeLessThanOrEqual(res.trajectory[i - 1].inventory);
    }
  });

  it('Wave 263: López de Prado (2018) Fractionally Differentiated Features', () => {
    // Generate synthetic random walk / trend series
    const series: number[] = [];
    let p = 100.0;
    for (let i = 0; i < 200; i++) {
      p += Math.sin(i * 0.2) + 0.5;
      series.push(p);
    }

    const res = LopezDePrado2018FracDiff.computeFractionalDifferentiation(series, {
      d: 0.4,
      threshold: 1e-2,
    });

    expect(res.weightProfile.d).toBe(0.4);
    expect(res.weightProfile.weights[0]).toBe(1.0);
    expect(res.weightProfile.weights[1]).toBeCloseTo(-0.4, 4);
    expect(res.validLength).toBeGreaterThan(10);
    // Preserves memory (positive correlation with original series)
    expect(res.memoryRetentionCorrelation).toBeGreaterThan(0.3);
  });

  it('Wave 264: Almgren & Li (2016) Option Hedging with Market Impact', () => {
    // Target delta schedule from Black-Scholes hedge adjusting over time
    const deltas = [1000, 1200, 1500, 1400, 1600, 2000];

    const res = AlmgrenLi2016Option.computeAlmgrenLiHedging({
      targetDeltaTrajectory: deltas,
      timeStep: 1.0,
      tempImpactEta: 0.01,
      riskAversionLambda: 1e-3,
      assetVolatility: 0.25,
      initialHolding: 1000,
    });

    expect(res.optimalLagTimescale).toBeGreaterThan(0);
    expect(res.totalSlippageCost).toBeGreaterThan(0);
    expect(res.trajectory.length).toBe(6);
    expect(res.trajectory[0].holding).toBe(1000);
    expect(res.trajectory[0].trackingError).toBe(0);
    expect(res.totalFrictionObjective).toBeGreaterThan(0);
  });
});
