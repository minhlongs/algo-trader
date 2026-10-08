import { FactorExposure, FactorAttributionResult } from './portfolio-types';

export class FactorRiskAttributionEngine {
  /**
   * Decomposes total active portfolio risk into common factor risk and asset-specific risk:
   * Var(R_p) = beta_p^T * Omega_factor * beta_p + sum(w_i^2 * sigma_epsilon_i^2)
   */
  public attributeRisk(
    weights: number[],
    exposures: FactorExposure[],
    factorCovariance: { [factorA: string]: { [factorB: string]: number } },
    specificVariances: number[]
  ): FactorAttributionResult {
    const N = weights.length;
    if (N !== exposures.length || N !== specificVariances.length) {
      throw new Error('Weights, exposures, and specific variances dimensions must match');
    }

    // 1. Calculate portfolio factor beta: beta_p,k = sum_i(w_i * beta_i,k)
    const factorNames = Object.keys(factorCovariance);
    const portFactorBeta: { [factor: string]: number } = {};

    for (const factor of factorNames) {
      let bSum = 0;
      for (let i = 0; i < N; i++) {
        const beta_ik = exposures[i]!.factorBeta[factor] ?? 0;
        bSum += weights[i]! * beta_ik;
      }
      portFactorBeta[factor] = bSum;
    }

    // 2. Compute factor variance contributions
    const factorContrib: { [factor: string]: number } = {};
    let totalFactorVariance = 0;

    for (const fA of factorNames) {
      let fVar = 0;
      for (const fB of factorNames) {
        const cov_AB = factorCovariance[fA]![fB] ?? 0;
        fVar += portFactorBeta[fA]! * portFactorBeta[fB]! * cov_AB;
      }
      factorContrib[fA] = Number((fVar * 10000).toFixed(4));
      totalFactorVariance += fVar;
    }

    // 3. Compute specific (idiosyncratic) variance: sum(w_i^2 * sigma_eps_i^2)
    let totalSpecificVariance = 0;
    for (let i = 0; i < N; i++) {
      totalSpecificVariance += weights[i]! * weights[i]! * specificVariances[i]!;
    }

    const totalVariance = totalFactorVariance + totalSpecificVariance;

    return {
      totalVariancePct: Number((totalVariance * 10000).toFixed(4)),
      factorRiskContributionPct: factorContrib,
      specificRiskPct: Number((totalSpecificVariance * 10000).toFixed(4)),
    };
  }
}
