/**
 * Rough Heston Engine implementing Jaisson & Rosenbaum (2015, 2016) limit scaling.
 *
 * Models nearly-unstable Hawkes microstructure scaling to rough CIR fractional volatility.
 * Strictly < 120 LOC, zero :any.
 */

import {
  RoughHestonConfig,
  RoughHestonAssessment,
  RoughVolatilityTrajectory,
} from './rough-heston-types';
import {
  computeHurstParameter,
  computeFractionalKernel,
  simulateDeterministicRoughTrajectory,
} from './rough-heston-math';

export class RoughHestonEngine {
  private readonly config: RoughHestonConfig;

  constructor(config?: Partial<RoughHestonConfig>) {
    this.config = {
      alpha: config?.alpha ?? 0.65, // H = 0.15
      baselineIntensity: config?.baselineIntensity ?? 1.2,
      branchingRatio: config?.branchingRatio ?? 0.95,
      volOfVol: config?.volOfVol ?? 0.3,
      meanReversion: config?.meanReversion ?? 2.0,
      theta: config?.theta ?? 0.04,
    };
  }

  public evaluate(currentVariance?: number): RoughHestonAssessment {
    const H = computeHurstParameter(this.config.alpha);
    const kernelSample = computeFractionalKernel(this.config.alpha, 10, 0.1);
    const v0 = currentVariance ?? this.config.theta;
    const stabilityMargin = Math.round((1.0 - this.config.branchingRatio) * 1000) / 1000;

    return {
      hurstParameter: H,
      branchingRatio: this.config.branchingRatio,
      fractionalMemoryKernel: kernelSample.map((k) => Math.round(k * 1000) / 1000),
      instantaneousVariance: Math.round(v0 * 1e6) / 1e6,
      isRough: H < 0.5,
      stabilityMargin,
    };
  }

  public forecastTrajectory(
    initialVariance: number,
    steps = 20,
    dt = 0.05
  ): RoughVolatilityTrajectory {
    return simulateDeterministicRoughTrajectory(this.config, initialVariance, steps, dt);
  }
}
