/**
 * Wave 223: Guéant (2015) Accelerated Share Repurchase (ASR) Math.
 *
 * Implements hyperbolic optimal velocity trajectory for ASR contracts.
 * Strictly < 80 LOC, zero mocks, zero :any.
 */

import type { GueantAsrConfig, AsrTrajectoryPoint } from './gueant-asr-types';

export class GueantAsrMath {
  public static computeKappa(config: GueantAsrConfig): number {
    const numerator = config.inventoryRiskGamma * Math.pow(config.volatilitySigma, 2);
    const denominator = Math.max(1e-9, config.temporaryImpactEta);
    return Math.sqrt(numerator / denominator);
  }

  public static computeOptimalVelocity(config: GueantAsrConfig, timeSec: number): number {
    const kappa = this.computeKappa(config);
    const tRemaining = Math.max(0, config.horizonSec - timeSec);
    const sinhKT = Math.sinh(kappa * config.horizonSec);

    if (Math.abs(sinhKT) < 1e-9) {
      return config.totalSharesX0 / Math.max(1.0, config.horizonSec);
    }

    const coshKRemaining = Math.cosh(kappa * tRemaining);
    return (config.totalSharesX0 * kappa * coshKRemaining) / sinhKT;
  }

  public static computeTrajectory(
    config: GueantAsrConfig,
    evaluationTimesSec: number[]
  ): AsrTrajectoryPoint[] {
    const kappa = this.computeKappa(config);
    const sinhKT = Math.sinh(kappa * config.horizonSec);

    return evaluationTimesSec.map((t) => {
      const v = this.computeOptimalVelocity(config, t);
      const tRem = Math.max(0, config.horizonSec - t);
      const remaining =
        Math.abs(sinhKT) < 1e-9
          ? config.totalSharesX0 * (1 - t / Math.max(1.0, config.horizonSec))
          : (config.totalSharesX0 * Math.sinh(kappa * tRem)) / sinhKT;

      const penalty =
        config.temporaryImpactEta * Math.pow(v, 2) +
        config.inventoryRiskGamma * Math.pow(config.volatilitySigma * remaining, 2);

      return {
        timeSec: t,
        remainingShares: Math.max(0, Number(remaining.toFixed(2))),
        optimalVelocitySharesPerSec: Number(v.toFixed(4)),
        cumulativeCostPenalty: Number(penalty.toFixed(4)),
      };
    });
  }
}
