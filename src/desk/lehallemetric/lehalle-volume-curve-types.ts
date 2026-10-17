/**
 * Wave 244: Lehalle (2009) Volume Curve Dynamics & Intraday Trajectory Types
 * Strictly < 60 LOC, zero :any.
 */

export interface LehalleVolumeCurveConfig {
  totalTargetVolumeV: number;
  timeHorizonT: number; // e.g. 1.0 (trading day)
  shapeParamAlpha: number; // U-shape morning parameter (e.g., 0.6)
  shapeParamBeta: number; // U-shape afternoon parameter (e.g., 0.8)
  noiseScalingEta: number; // Intraday volume variation scale
}

export interface LehalleIntradayBucket {
  timeIndex: number;
  startTime: number;
  endTime: number;
  expectedVolumeShare: number;
  targetVolume: number;
  cumulativeVolume: number;
}

export interface LehalleTrajectoryResult {
  buckets: LehalleIntradayBucket[];
  totalScheduledVolume: number;
  peakVolumeRatio: number;
}
