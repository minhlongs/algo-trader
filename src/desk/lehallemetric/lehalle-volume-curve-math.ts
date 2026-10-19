/**
 * Wave 244: Lehalle (2009) Volume Curve Dynamics & Intraday Trajectory Math
 * Strictly < 90 LOC, zero mocks, deterministic mathematical formulation.
 */

import { LehalleIntradayBucket, LehalleTrajectoryResult, LehalleVolumeCurveConfig } from './lehalle-volume-curve-types';

export function calculateIntradayUVolumeDensity(
  normalizedTimeT: number,
  alpha: number,
  beta: number
): number {
  // Standard U-shaped quadratic/convex curve in literature: (t - 0.5)^2 or inverse distance to extremes
  // Peak at open t=0 and close t=1, nadir at midday t=0.5
  const centerDiff = normalizedTimeT - 0.5;
  const uShapeQuadratic = 4.0 * centerDiff * centerDiff; // 1.0 at edges, 0.0 at center
  const asymmetry = normalizedTimeT < 0.5 ? alpha : beta;
  const baseline = 0.2;
  return baseline + asymmetry * uShapeQuadratic;
}

export function computeLehalleVolumeTrajectory(
  config: LehalleVolumeCurveConfig,
  intervalsN: number = 10
): LehalleTrajectoryResult {
  const dt = config.timeHorizonT / intervalsN;
  const rawDensities: number[] = [];
  let sumDensity = 0.0;

  for (let i = 0; i < intervalsN; i++) {
    const midT = (i + 0.5) / intervalsN;
    const density = calculateIntradayUVolumeDensity(midT, config.shapeParamAlpha, config.shapeParamBeta);
    rawDensities.push(density);
    sumDensity += density;
  }

  const buckets: LehalleIntradayBucket[] = [];
  let cumulative = 0;
  let maxVolume = 0;

  for (let i = 0; i < intervalsN; i++) {
    const share = rawDensities[i] / sumDensity;
    const bucketVol = share * config.totalTargetVolumeV;
    cumulative += bucketVol;
    if (bucketVol > maxVolume) {
      maxVolume = bucketVol;
    }

    buckets.push({
      timeIndex: i,
      startTime: i * dt,
      endTime: (i + 1) * dt,
      expectedVolumeShare: share,
      targetVolume: bucketVol,
      cumulativeVolume: cumulative,
    });
  }

  const avgVol = config.totalTargetVolumeV / intervalsN;
  const peakVolumeRatio = avgVol > 0 ? maxVolume / avgVol : 1.0;

  return {
    buckets,
    totalScheduledVolume: cumulative,
    peakVolumeRatio,
  };
}
