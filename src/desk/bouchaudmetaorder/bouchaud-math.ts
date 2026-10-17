/**
 * Wave 229: Bouchaud, Farmer & Lillo (2009) Metaorder Square-Root Impact Math.
 * I(Q) = Y * sigma * sqrt(Q / V).
 * Post-execution relaxation: R(t) = I(Q) / (1 + (t / T)^beta).
 * Strictly < 200 LOC, zero :any.
 */

import { BouchaudImpactConfig, MetaorderParams, MetaorderImpactAssessment } from './bouchaud-types';

export class BouchaudMath {
  public static computePeakImpact(
    config: BouchaudImpactConfig,
    metaorderSharesQ: number
  ): number {
    if (config.dailyVolumeV <= 0 || metaorderSharesQ <= 0) {
      return 0;
    }
    const participation = metaorderSharesQ / config.dailyVolumeV;
    return config.universalY * config.dailyVolatilitySigma * Math.sqrt(participation);
  }

  public static computeRelaxation(
    peakImpact: number,
    timePostSec: number,
    executionDurationSecT: number,
    beta: number = 0.5
  ): number {
    if (timePostSec <= 0 || executionDurationSecT <= 0) {
      return peakImpact;
    }
    const normalizedTime = timePostSec / executionDurationSecT;
    return peakImpact / (1 + Math.pow(normalizedTime, beta));
  }

  public static assessMetaorder(
    config: BouchaudImpactConfig,
    params: MetaorderParams
  ): MetaorderImpactAssessment {
    const peak = this.computePeakImpact(config, params.metaorderSharesQ);
    const participation = config.dailyVolumeV > 0 ? params.metaorderSharesQ / config.dailyVolumeV : 0;
    // Empirical permanent impact is ~ 2/3 of peak metaorder impact
    const permanentEst = peak * (2 / 3);

    return {
      peakImpact: peak,
      participationRatio: participation,
      permanentImpactEst: permanentEst,
      instantaneousImpactAtEnd: peak,
    };
  }
}
