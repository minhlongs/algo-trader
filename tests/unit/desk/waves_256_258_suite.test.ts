import { describe, expect, it } from 'vitest';
import { ContDeLarrard2013, LehalleMounjid2017, Gueant2015MultiAsset } from '../../../src/desk/index';

describe('Quantitative Desk Models (Waves 256 - 258)', () => {
  it('Wave 256: Cont & de Larrard (2013) Markovian LOB Queue Depletion', () => {
    const balanced = ContDeLarrard2013.computeContDeLarrardDynamics({
      bidQueueSize: 50, askQueueSize: 50, lambdaArrivalRate: 5.0, muDepletionRate: 5.0, laplaceParamS: 0.1,
    });
    expect(balanced.imbalanceRatio).toBeCloseTo(0, 5);
    expect(balanced.probPriceIncrease).toBeCloseTo(0.5, 5);
    expect(balanced.probPriceDecrease).toBeCloseTo(0.5, 5);
    expect(balanced.laplaceTransformBid).toBeCloseTo(balanced.laplaceTransformAsk, 5);

    const bidHeavy = ContDeLarrard2013.computeContDeLarrardDynamics({
      bidQueueSize: 80, askQueueSize: 20, lambdaArrivalRate: 4.0, muDepletionRate: 6.0, laplaceParamS: 0.05,
    });
    expect(bidHeavy.imbalanceRatio).toBeCloseTo(0.6, 5);
    expect(bidHeavy.probPriceIncrease).toBeGreaterThan(0.5);
    expect(bidHeavy.expectedDepletionTimeBid).toBeGreaterThan(bidHeavy.expectedDepletionTimeAsk);
    expect(bidHeavy.laplaceTransformBid).toBeLessThan(bidHeavy.laplaceTransformAsk);
    expect(bidHeavy.laplaceTransformBid).toBeGreaterThan(0);
  });

  it('Wave 257: Lehalle & Mounjid (2017) Optimal Execution with Limit Orders', () => {
    const zeroAdv = LehalleMounjid2017.computeLehalleMounjidOptimalOrder({
      baseFillIntensityA: 2.0, queueDecayK: 1.5, adverseJumpHazardTheta: 0.0,
      jumpSeverityDeltaP: 0.05, riskAversionGamma: 0.1, inventoryQ: 0,
    });
    expect(zeroAdv.adverseSelectionCost).toBe(0);
    expect(zeroAdv.optimalQueueDistance).toBeCloseTo(1.0 / 1.5, 4);
    expect(zeroAdv.adverseExecutionProbability).toBe(0);

    const toxic = LehalleMounjid2017.computeLehalleMounjidOptimalOrder({
      baseFillIntensityA: 2.0, queueDecayK: 1.5, adverseJumpHazardTheta: 0.8,
      jumpSeverityDeltaP: 0.5, riskAversionGamma: 0.1, inventoryQ: 0,
    });
    expect(toxic.adverseSelectionCost).toBe(0.4);
    expect(toxic.optimalQueueDistance).toBeGreaterThan(zeroAdv.optimalQueueDistance);
    expect(toxic.adverseExecutionProbability).toBeGreaterThan(0);

    const urgent = LehalleMounjid2017.computeLehalleMounjidOptimalOrder({
      baseFillIntensityA: 2.0, queueDecayK: 1.5, adverseJumpHazardTheta: 0.8,
      jumpSeverityDeltaP: 0.5, riskAversionGamma: 0.1, inventoryQ: 5,
    });
    expect(urgent.optimalQueueDistance).toBeLessThan(toxic.optimalQueueDistance);
  });

  it('Wave 258: Guéant (2015) Multi-Asset Cross-Impact Liquidation', () => {
    const H = [[2.0, 0.4], [0.4, 1.8]], Sigma = [[0.05, 0.015], [0.015, 0.04]], gamma = 0.2;
    const res = Gueant2015MultiAsset.computeGueantMultiAssetLiquidation({
      initialInventoryQ0: [100, 80], crossImpactH: H, covarianceSigma: Sigma,
      riskAversionGamma: gamma, executionHorizonT: 1.0, steps: 10,
    });
    const S = res.riccatiMatrixS, det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    const H_inv = [[H[1][1] / det, -H[0][1] / det], [-H[1][0] / det, H[0][0] / det]];
    const SH = [
      [S[0][0] * H_inv[0][0] + S[0][1] * H_inv[1][0], S[0][0] * H_inv[0][1] + S[0][1] * H_inv[1][1]],
      [S[1][0] * H_inv[0][0] + S[1][1] * H_inv[1][0], S[1][0] * H_inv[0][1] + S[1][1] * H_inv[1][1]],
    ];
    const SHS = [
      [SH[0][0] * S[0][0] + SH[0][1] * S[1][0], SH[0][0] * S[0][1] + SH[0][1] * S[1][1]],
      [SH[1][0] * S[0][0] + SH[1][1] * S[1][0], SH[1][0] * S[0][1] + SH[1][1] * S[1][1]],
    ];
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) expect(SHS[i][j]).toBeCloseTo(gamma * Sigma[i][j], 4);

    expect(res.inventoryTrajectory[0][0]).toBe(100);
    expect(res.inventoryTrajectory[10][0]).toBeLessThan(res.inventoryTrajectory[0][0]);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.crossImpactFriction).toBeGreaterThan(0);
    expect(S[0][1]).toBeCloseTo(S[1][0], 6);
  });
});
