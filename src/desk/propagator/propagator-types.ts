/**
 * Type definitions for Bouchaud, Mézard & Potters (2004) Propagator Model.
 *
 * Models bare price impact kernel G_0(l) = Gamma_0 / (1 + l)^gamma and
 * cross-asset impact spillovers r_i(t) = sum_j sum_l G_ij(l) epsilon_j(t-l).
 *
 * Strictly < 120 LOC, zero :any.
 */

export interface PropagatorKernelConfig {
  gamma0: number;                 // Base instantaneous impact coefficient Gamma_0 > 0
  decayExponent: number;          // Power-law decay exponent gamma in (0, 0.5]
  maxLag: number;                 // Maximum memory horizon L >= 1
}

export interface CrossImpactMatrixConfig {
  assets: string[];
  crossCoefficients: number[][];  // M x M matrix of cross-asset spillover weights
  decayExponent: number;          // Shared or calibrated decay gamma
  maxLag: number;
}

export interface PropagatorAssessment {
  predictedReturn: number;
  accumulatedImpact: number;
  effectiveSpreadCost: number;
  decayProfile: number[];
  efficiencyIndex: number;        // gamma + gamma_C fine-tuning proximity to 1.0
  isSubDiffusive: boolean;
}

export interface CrossImpactAssessment {
  predictedReturns: Record<string, number>;
  eigenImpactRatio: number;
  spilloverIntensity: number;
  dominantDriver: string;
}
