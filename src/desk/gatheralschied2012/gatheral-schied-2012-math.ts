import { GatheralSchied2012Config, GramMatrixAssessment } from './types';

/**
 * Wave 254: Gatheral, Schied & Slynko (2012) Gram Impact Matrix & No-Arbitrage Verification.
 * Strictly < 80 LOC, zero :any.
 */
export function evaluateGramImpactMatrix(
  config: GatheralSchied2012Config
): GramMatrixAssessment {
  const n = Math.max(2, config.matrixDimensionN ?? 5);
  const dt = Math.max(0.01, config.timeStepDeltaT ?? 1.0);
  const { kernelType, gammaScale, decayAlpha, offsetTau0 } = config;

  // Discretized kernel function G(tau)
  const kernel = (tau: number): number => {
    if (kernelType === 'EXPONENTIAL') {
      return gammaScale * Math.exp(-decayAlpha * tau);
    }
    return gammaScale / Math.pow(tau + Math.max(1e-4, offsetTau0), decayAlpha);
  };

  // Construct symmetric Gram impact matrix Gamma_ij = G(|i - j| * dt)
  const gamma: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      gamma[i][j] = kernel(Math.abs(i - j) * dt);
    }
  }

  // Cholesky Decomposition L L^T = Gamma
  const l: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let isPositiveDefinite = true;
  let minimumPivot = Number.POSITIVE_INFINITY;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += l[i][k] * l[j][k];
      }

      if (i === j) {
        const diagRem = gamma[i][i] - sum;
        minimumPivot = Math.min(minimumPivot, diagRem);
        if (diagRem <= 1e-12) {
          isPositiveDefinite = false;
          l[i][j] = 0;
        } else {
          l[i][j] = Math.sqrt(diagRem);
        }
      } else {
        l[i][j] = l[j][j] > 1e-12 ? (gamma[i][j] - sum) / l[j][j] : 0;
      }
    }
  }

  return {
    gramMatrix: gamma,
    choleskyFactor: l,
    isPositiveDefinite,
    minimumPivot: Number.isFinite(minimumPivot) ? minimumPivot : 0,
    dynamicArbitrageFree: isPositiveDefinite,
  };
}
