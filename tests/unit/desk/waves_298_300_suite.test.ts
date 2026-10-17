import { describe, expect, it } from 'vitest';
import {
  CarteaJaimungal2016Incorporating,
  GatheralKellerRessel2019Affine,
  GueantLehalle2012LimitLiq,
} from '../../../src/desk/index';

describe('Quantitative Desk Models — Waves 298-300', () => {
  it('Wave 298: Guéant, Lehalle & Fernandez-Tapia (2012) Optimal Liquidation with Limit Orders', () => {
    const res = GueantLehalle2012LimitLiq.computeGueantLehalle2012LimitLiq({
      remainingInventoryQ: 12.0,
      remainingHorizonT: 0.5,
      riskAversionGamma: 0.2,
      volatilitySigma: 0.3,
      orderFillDecayKappa: 2.0,
      baseArrivalIntensityA: 4.0,
      terminalSweepPenaltyB: 0.05,
    });
    expect(res.asymptoticLimitOffset).toBeGreaterThan(1.0);
    expect(res.urgencyDiscountAdjustment).toBeGreaterThan(0);
    expect(res.optimalAskPostingOffset).toBeLessThan(res.asymptoticLimitOffset);
    expect(res.instantaneousFillIntensity).toBeGreaterThan(0);
  });

  it('Wave 299: Cartea & Jaimungal (2016) Incorporating Order-Flow into Optimal Execution', () => {
    const res = CarteaJaimungal2016Incorporating.computeCarteaJaimungal2016Incorporating({
      currentInventoryQ: 100.0,
      remainingHorizonT: 1.0,
      temporaryImpactEta: 0.04,
      runningInventoryPenaltyPhi: 0.01,
      netOrderFlowRateMu: -40.0,
      orderFlowMeanReversionKappa: 3.0,
      permanentCoImpactBeta: 0.02,
    });
    expect(res.urgencyRateGamma).toBeCloseTo(0.5, 6);
    expect(res.orderFlowSignalAdjustment).toBeGreaterThan(0);
    expect(res.optimalExecutionRate).toBeGreaterThan(res.baselineAcExecutionRate);
    expect(res.frontRunningAcceleratesSell).toBe(true);
  });

  it('Wave 300: Gatheral & Keller-Ressel (2019) Affine Forward Variance Models', () => {
    const res = GatheralKellerRessel2019Affine.computeGatheralKellerRessel2019Affine({
      spotVarianceV0: 0.04,
      longRunVarianceTheta: 0.0625,
      meanReversionLambda: 1.5,
      hurstExponentH: 0.1,
      volOfVolNu: 0.3,
      maturityT: 1.0,
    });
    expect(res.roughAlphaExponent).toBeCloseTo(0.6, 8);
    expect(res.forwardVarianceAtMaturity).toBeGreaterThan(0.04);
    expect(res.forwardVarianceAtMaturity).toBeLessThan(0.0625);
    expect(res.affineVarianceSwapFairStrike).toBeGreaterThan(0.2);
    expect(res.isAffineAdmissible).toBe(true);
  });
});
