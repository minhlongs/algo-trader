import { BranchingRatioAnalysis } from './hawkes-types';

export class BranchingRatioStabilityAnalyzer {
  /**
   * Computes branching ratio matrix Gamma_ij = alpha_ij / beta_ij
   * and solves for spectral radius using power iteration.
   */
  public analyzeStability(
    alphaMatrix: number[][],
    betaMatrix: number[][]
  ): BranchingRatioAnalysis {
    const N = alphaMatrix.length;
    if (N === 0) throw new Error('Matrices cannot be empty');

    const gamma: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const beta = Math.max(1e-6, betaMatrix[i]![j]!);
        gamma[i]![j] = Number((alphaMatrix[i]![j]! / beta).toFixed(4));
      }
    }

    // Power iteration to find dominant eigenvalue (spectral radius)
    let v: number[] = new Array(N).fill(1.0 / Math.sqrt(N));
    let spectralRadius = 0;

    for (let iter = 0; iter < 100; iter++) {
      const nextV: number[] = new Array(N).fill(0);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          nextV[i] += gamma[i]![j]! * v[j]!;
        }
      }

      // Compute Rayleigh quotient / norm
      const norm = Math.sqrt(nextV.reduce((acc, val) => acc + val * val, 0));
      if (norm < 1e-8) {
        spectralRadius = 0;
        break;
      }
      spectralRadius = norm;
      v = nextV.map((val) => val / norm);
    }

    const rho = Number(spectralRadius.toFixed(4));
    let regime: 'SUB_CRITICAL' | 'NEAR_CRITICAL' | 'SUPER_CRITICAL' = 'SUB_CRITICAL';

    if (rho >= 1.0) {
      regime = 'SUPER_CRITICAL';
    } else if (rho >= 0.85) {
      regime = 'NEAR_CRITICAL';
    }

    return {
      branchingMatrix: gamma,
      spectralRadius: rho,
      isSystemStable: rho < 1.0,
      reflexivityRegime: regime,
    };
  }
}
