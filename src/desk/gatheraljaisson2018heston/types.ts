/**
 * Wave 294 — Gatheral, Jaisson & Rosenbaum (2018): Rough Heston Fractional Kernel Discretization
 * Types & Configuration Interfaces
 */

export interface GatheralJaisson2018HestonConfig {
  readonly hurstExponentH: number;
  readonly horizonSec: number;
  readonly stepsN: number;
  readonly baselineVarianceV0: number;
  readonly volOfVolNu: number;
}

export interface GatheralJaisson2018HestonResult {
  readonly kernelWeights: readonly number[];
  readonly frontLagWeightShare: number;
  readonly integratedKernelMass: number;
  readonly roughVarianceScalingFactor: number;
}
