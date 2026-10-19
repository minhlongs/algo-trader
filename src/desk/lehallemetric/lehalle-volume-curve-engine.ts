/**
 * Wave 244: Lehalle (2009) Volume Curve Dynamics & Intraday Trajectory Engine
 * Strictly < 50 LOC, zero :any.
 */

import { LehalleTrajectoryResult, LehalleVolumeCurveConfig } from './lehalle-volume-curve-types';
import { computeLehalleVolumeTrajectory } from './lehalle-volume-curve-math';

export class LehalleVolumeCurveEngine {
  private readonly config: LehalleVolumeCurveConfig;

  constructor(config: LehalleVolumeCurveConfig) {
    if (config.totalTargetVolumeV <= 0) {
      throw new Error('totalTargetVolumeV must be strictly positive');
    }
    if (config.timeHorizonT <= 0) {
      throw new Error('timeHorizonT must be strictly positive');
    }
    this.config = config;
  }

  public generateTrajectory(intervalsN: number = 10): LehalleTrajectoryResult {
    return computeLehalleVolumeTrajectory(this.config, intervalsN);
  }
}
