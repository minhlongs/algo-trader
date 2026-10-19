/**
 * Propagator Engine implementing Bouchaud et al. (2004) transient impact dynamics.
 *
 * Provides single-asset propagator evaluation and cross-asset spillover assessment.
 * Strictly < 120 LOC, zero :any.
 */

import {
  PropagatorKernelConfig,
  CrossImpactMatrixConfig,
  PropagatorAssessment,
  CrossImpactAssessment,
} from './propagator-types';
import {
  computeKernelProfile,
  convolveImpact,
  computeEfficiencyBalance,
  computeCrossSpilloverMetrics,
} from './propagator-math';

export class PropagatorEngine {
  private readonly kernelConfig: PropagatorKernelConfig;

  constructor(config?: Partial<PropagatorKernelConfig>) {
    this.kernelConfig = {
      gamma0: config?.gamma0 ?? 0.05,
      decayExponent: config?.decayExponent ?? 0.3,
      maxLag: config?.maxLag ?? 50,
    };
  }

  public evaluateSingleAsset(
    orderSigns: number[],
    orderFlowPersistenceGammaC = 0.7
  ): PropagatorAssessment {
    const kernelProfile = computeKernelProfile(this.kernelConfig);
    const predictedReturn = convolveImpact(orderSigns, kernelProfile);

    // Accumulated total impact if all orders were +1
    let accumulated = 0.0;
    for (const val of kernelProfile) {
      accumulated += val;
    }

    const effectiveSpreadCost = (kernelProfile[0] ?? 0.0) * 0.5;
    const balance = computeEfficiencyBalance(
      this.kernelConfig.decayExponent,
      orderFlowPersistenceGammaC
    );

    return {
      predictedReturn: Math.round(predictedReturn * 1e6) / 1e6,
      accumulatedImpact: Math.round(accumulated * 1e6) / 1e6,
      effectiveSpreadCost: Math.round(effectiveSpreadCost * 1e6) / 1e6,
      decayProfile: kernelProfile.slice(0, 10).map((v) => Math.round(v * 1e5) / 1e5),
      efficiencyIndex: balance.efficiencyIndex,
      isSubDiffusive: balance.isSubDiffusive,
    };
  }

  public evaluateCrossImpact(
    config: CrossImpactMatrixConfig,
    recentSignsByAsset: Record<string, number[]>
  ): CrossImpactAssessment {
    return computeCrossSpilloverMetrics(config, recentSignsByAsset);
  }
}
