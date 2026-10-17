/**
 * Wave 231: Jaisson & Rosenbaum (2016) Microstructural High-Frequency Hawkes Rough Heston Math.
 * Power-law kernel phi(t) = (alpha / Gamma(1 - alpha)) * t^(-(1 + alpha)).
 * Implied Hurst index: H = alpha - 0.5.
 * Criticality: eta -> 1 (nearly unstable regime).
 * Strictly < 200 LOC, zero :any.
 */

import {
  HawkesRoughHestonConfig,
  HighFrequencyArrivalSnapshot,
  HawkesMicrostructureAssessment,
} from './jaisson-types';

export class JaissonMath {
  public static computeImpliedHurst(alpha: number): number {
    return Math.max(0.01, Math.min(0.49, alpha - 0.5));
  }

  public static computeInstantaneousIntensity(
    config: HawkesRoughHestonConfig,
    snapshot: HighFrequencyArrivalSnapshot
  ): number {
    let excitation = 0;
    const tNow = snapshot.currentEvaluationTimeSec;
    const alpha = config.memoryKernelAlpha;

    for (const tEvent of snapshot.pastArrivalTimesSec) {
      const dt = tNow - tEvent;
      if (dt > 1e-4) {
        // Regularized heavy-tailed decay ~ dt^(-alpha)
        excitation += Math.pow(dt, -alpha);
      }
    }

    const scaledExcitation = config.branchingRatioEta * excitation * 0.05;
    return config.baselineIntensityLambda0 + scaledExcitation;
  }

  public static evaluate(
    config: HawkesRoughHestonConfig,
    snapshot: HighFrequencyArrivalSnapshot
  ): HawkesMicrostructureAssessment {
    const lambda = this.computeInstantaneousIntensity(config, snapshot);
    const hurst = this.computeImpliedHurst(config.memoryKernelAlpha);
    const isNearlyUnstable = config.branchingRatioEta >= 0.90;
    const stationaryMean =
      config.branchingRatioEta < 1.0
        ? config.baselineIntensityLambda0 / (1 - config.branchingRatioEta)
        : Number.POSITIVE_INFINITY;

    return {
      instantaneousIntensity: lambda,
      impliedHurstExponentH: hurst,
      isNearlyUnstable,
      stationaryMeanIntensity: stationaryMean,
    };
  }
}
