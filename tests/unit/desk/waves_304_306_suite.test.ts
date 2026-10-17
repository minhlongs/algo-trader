import { describe, expect, it } from 'vitest';
import {
  ContKukanovStoikov2014DeepOfi,
  GatheralJaisson2018Hawkes,
  GueantLehalle2015TargetPov,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 304-306 Suite', () => {
  it('Wave 304: Cont-Kukanov-Stoikov (2014) Multi-Level Deep Queue OFI', () => {
    const res = ContKukanovStoikov2014DeepOfi.ContKukanovStoikov2014DeepOfi.evaluate({
      levels: [
        {
          levelIndex: 1,
          bidQueueDeltaShares: 1800,
          askQueueDeltaShares: -400,
          depthNormalizationShares: 2000,
        },
        {
          levelIndex: 2,
          bidQueueDeltaShares: 900,
          askQueueDeltaShares: -100,
          depthNormalizationShares: 2500,
        },
      ],
      levelDecayRateKappa: 0.45,
      priceImpactSlopeBeta: 1.25,
      adverseQueueDepletionThreshold: 0.95,
    });
    expect(res.weightedDeepOfi).toBeGreaterThan(0.6);
    expect(res.predictedMidPriceChangeTicks).toBeGreaterThan(0.75);
    expect(res.adverseSweepDetected).toBe(true);
    expect(res.regime).toBe('ADVERSE_MULTI_LEVEL_SWEEP');
  });

  it('Wave 305: Gueant-Lehalle (2015) General Intensity Target POV Schedule', () => {
    const res = GueantLehalle2015TargetPov.GueantLehalle2015TargetPov.evaluate({
      remainingSharesQ: 45000,
      expectedMarketVolumeRateV: 120,
      remainingHorizonSeconds: 600,
      impactExponentPhi: 0.6,
      temporaryImpactEta: 0.0025,
      riskAversionGamma: 0.0001,
      volatilitySigma: 0.35,
      maxPovCapRatio: 0.25,
    });
    expect(res.characteristicRateLambda).toBeGreaterThan(0);
    expect(res.cappedTargetPovRatio).toBeLessThanOrEqual(0.25);
    expect(res.childOrderRateSharesPerSec).toBeCloseTo(res.cappedTargetPovRatio * 120, 2);
  });

  it('Wave 306: Gatheral-Jaisson-Rosenbaum (2018) Hawkes Endogeneity & Rough H Link', () => {
    const nearCrit = GatheralJaisson2018Hawkes.GatheralJaisson2018Hawkes.evaluate({
      branchingRatioNormN: 0.91,
      kernelTailExponentOnePlusAlpha: 1.62,
      baselineIntensityMu: 12.0,
      criticalBranchingCutoff: 0.96,
    });
    expect(nearCrit.alphaExponent).toBeCloseTo(0.62, 4);
    expect(nearCrit.impliedRoughHurstH).toBeCloseTo(0.12, 4);
    expect(nearCrit.supercriticalFlashCrashRisk).toBe(false);
    expect(nearCrit.regime).toBe('NEAR_CRITICAL_ROUGH_SCALING');

    const superCrit = GatheralJaisson2018Hawkes.GatheralJaisson2018Hawkes.evaluate({
      branchingRatioNormN: 0.98,
      kernelTailExponentOnePlusAlpha: 1.58,
      baselineIntensityMu: 12.0,
      criticalBranchingCutoff: 0.96,
    });
    expect(superCrit.supercriticalFlashCrashRisk).toBe(true);
    expect(superCrit.regime).toBe('SUPERCRITICAL_ENDogeneity_TRIP');
  });
});
