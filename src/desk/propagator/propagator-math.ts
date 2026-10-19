/**
 * Pure mathematical functions for Bouchaud et al. (2004) Propagator Model.
 *
 * Implements power-law decay impact kernel, order sign convolutions,
 * efficiency balance condition (gamma + gamma_C = 1), and cross-impact spillovers.
 *
 * Strictly < 120 LOC, zero :any.
 */

import {
  PropagatorKernelConfig,
  CrossImpactMatrixConfig,
} from './propagator-types';

export function computeKernelProfile(config: PropagatorKernelConfig): number[] {
  const profile: number[] = [];
  const gamma = Math.max(0.01, Math.min(0.5, config.decayExponent));
  const gamma0 = Math.max(0.0, config.gamma0);
  const horizon = Math.max(1, config.maxLag);

  for (let l = 0; l < horizon; l++) {
    const val = gamma0 / Math.pow(1.0 + l, gamma);
    profile.push(val);
  }
  return profile;
}

export function convolveImpact(orderSigns: number[], kernel: number[]): number {
  const n = Math.min(orderSigns.length, kernel.length);
  if (n === 0) return 0.0;

  let acc = 0.0;
  for (let l = 0; l < n; l++) {
    acc += kernel[l] * orderSigns[l];
  }
  return acc;
}

export function computeEfficiencyBalance(
  gamma: number,
  orderFlowDecay: number
): { efficiencyIndex: number; isSubDiffusive: boolean } {
  const index = gamma + orderFlowDecay;
  return {
    efficiencyIndex: Math.round(index * 1000) / 1000,
    isSubDiffusive: index < 1.0,
  };
}

export function computeCrossSpilloverMetrics(
  config: CrossImpactMatrixConfig,
  recentSignsByAsset: Record<string, number[]>
): {
  predictedReturns: Record<string, number>;
  eigenImpactRatio: number;
  spilloverIntensity: number;
  dominantDriver: string;
} {
  const { assets, crossCoefficients, decayExponent, maxLag } = config;
  const m = assets.length;
  const returns: Record<string, number> = {};
  const driverContributions: Record<string, number> = {};

  assets.forEach((a) => {
    returns[a] = 0.0;
    driverContributions[a] = 0.0;
  });

  const kernelProfile = computeKernelProfile({ gamma0: 1.0, decayExponent, maxLag });
  let offDiagWeight = 0.0;
  let diagWeight = 0.0;

  for (let i = 0; i < m; i++) {
    const assetI = assets[i];
    let retI = 0.0;

    for (let j = 0; j < m; j++) {
      const assetJ = assets[j];
      const weight = crossCoefficients[i]?.[j] ?? 0.0;
      const impactJ = convolveImpact(recentSignsByAsset[assetJ] ?? [], kernelProfile) * weight;
      retI += impactJ;
      driverContributions[assetJ] = (driverContributions[assetJ] ?? 0.0) + Math.abs(impactJ);

      if (i === j) diagWeight += Math.abs(weight);
      else offDiagWeight += Math.abs(weight);
    }
    returns[assetI] = Math.round(retI * 1e6) / 1e6;
  }

  const totalWeight = diagWeight + offDiagWeight;
  const spilloverIntensity = totalWeight > 0 ? offDiagWeight / totalWeight : 0.0;
  const eigenImpactRatio = diagWeight > 0 ? totalWeight / diagWeight : 1.0;

  let dominantDriver = assets[0] ?? '';
  let maxImpact = -1;
  for (const [asset, impact] of Object.entries(driverContributions)) {
    if (impact > maxImpact) {
      maxImpact = impact;
      dominantDriver = asset;
    }
  }

  return {
    predictedReturns: returns,
    eigenImpactRatio: Math.round(eigenImpactRatio * 1000) / 1000,
    spilloverIntensity: Math.round(spilloverIntensity * 1000) / 1000,
    dominantDriver,
  };
}
