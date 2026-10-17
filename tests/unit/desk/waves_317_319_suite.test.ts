import { describe, expect, it } from 'vitest';
import {
  Bouchaud2009ImpactDecay,
  Cartea2017Tikhonov,
  Lehalle2019AdverseSelection,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 317-319', () => {
  it('Wave 317: Cartea2017Tikhonov computes regularized urgency and drift shrinkage under ambiguity', () => {
    const res = Cartea2017Tikhonov.Cartea2017Tikhonov.evaluate({
      inventorySharesQ: 1000,
      temporaryImpactEta: 1e-4,
      riskAversionPhi: 1e-6,
      ambiguityPenaltyLambda: 3e-6,
      rawDriftSignalAlpha: 0.04,
      signalVarianceSigmaSq: 5e5,
      remainingHorizonSecT: 100,
    });
    expect(res.regularizedUrgencyKappa).toBeCloseTo(0.2, 5);
    expect(res.shrinkageFactor).toBeCloseTo(0.4, 5);
    expect(res.filteredAlphaSignal).toBeCloseTo(0.016, 5);
    expect(res.optimalLiquidationRateSharesPerSec).toBeCloseTo(120, 4);
    expect(res.regime).toBe('AMBIGUITY_DAMPED');
  });

  it('Wave 318: Lehalle2019AdverseSelection evaluates queue-reactive adverse selection and net queue value', () => {
    const positive =
      Lehalle2019AdverseSelection.Lehalle2019AdverseSelection.evaluate({
        halfSpreadTicks: 1.5,
        cancelRatePerSecMu: 3.0,
        marketSweepRatePerSecLambda: 1.0,
        postDepletionMidMoveTicks: 2.0,
        queueHoldingCostTicks: 0.2,
      });
    expect(positive.sweepFillProbability).toBeCloseTo(0.25, 5);
    expect(positive.expectedAdverseSelectionTicks).toBeCloseTo(0.5, 5);
    expect(positive.netQueueValueTicks).toBeCloseTo(0.8, 5);
    expect(positive.regime).toBe('POSITIVE_QUEUE_VALUE');

    const toxic =
      Lehalle2019AdverseSelection.Lehalle2019AdverseSelection.evaluate({
        halfSpreadTicks: 0.5,
        cancelRatePerSecMu: 0.5,
        marketSweepRatePerSecLambda: 1.5,
        postDepletionMidMoveTicks: 1.2,
        queueHoldingCostTicks: 0.1,
      });
    expect(toxic.netQueueValueTicks).toBeLessThan(0);
    expect(toxic.regime).toBe('TOXIC_CANCEL_IMMEDIATELY');
  });

  it('Wave 319: Bouchaud2009ImpactDecay evaluates square-root peak impact and power-law relaxation', () => {
    const res = Bouchaud2009ImpactDecay.Bouchaud2009ImpactDecay.evaluate({
      metaorderSharesQ: 10000,
      dailyVolumeSharesV: 1000000,
      dailyVolatilityPriceUnitsSigma: 2.0,
      impactPrefactorY: 0.5,
      metaorderDurationSecT: 300,
      elapsedPostTradeSecTau: 900,
      decayExponentBeta: 0.5,
      permanentFloorFractionGamma: 0.2,
    });
    expect(res.participationRatio).toBeCloseTo(0.01, 5);
    expect(res.peakSquareRootImpact).toBeCloseTo(0.1, 5);
    expect(res.permanentAsymptoticImpact).toBeCloseTo(0.02, 5);
    expect(res.residualImpactAtTau).toBeCloseTo(0.06, 5);
    expect(res.regime).toBe('TRANSIENT_RELAXING');
  });
});
