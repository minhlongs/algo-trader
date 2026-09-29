import {
  ENGINE_IDS,
  EngineId,
  CovarianceMatrix,
} from './types';

export interface ErcSolverOptions {
  readonly tolerance?: number;
  readonly maxIterations?: number;
  readonly fallbackWeights?: Record<EngineId, number>;
}

export interface ErcSolverResult {
  readonly weights: Readonly<Record<EngineId, number>>;
  readonly riskContributions: Readonly<Record<EngineId, number>>;
  readonly maxDiscrepancy: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly portfolioVolatility: number;
}

export interface RawCcdResult {
  readonly weights: number[];
  readonly riskContributions: number[];
  readonly maxDiscrepancy: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly portfolioVariance: number;
}

/**
 * Cyclical Coordinate Descent solver for Equal Risk Contribution (Spinu formulation)
 * Minimizes F(x) = 0.5 * x^T * Sigma * x - sum(b_i * ln(x_i))
 */
export function solveErcCcd(
  sigma: readonly (readonly number[])[],
  budgets: readonly number[],
  tolerance = 1e-4,
  maxIterations = 25
): RawCcdResult {
  const n = sigma.length;
  // Initialize x using inverse volatility
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const diag = Math.max(sigma[i][i], 1e-8);
    const b = Math.max(budgets[i], 1e-6);
    x[i] = Math.sqrt(b / diag);
  }

  // Precompute sigma * x
  const sigmaX = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sigmaX[i] += sigma[i][j] * x[j];
    }
  }

  let iterations = 0;
  let maxDiscrepancy = 1.0;
  let converged = false;
  let weights = new Array<number>(n).fill(1 / n);
  let riskContributions = new Array<number>(n).fill(1 / n);
  let portVar = 1e-4;

  while (iterations < maxIterations) {
    iterations++;

    // Coordinate descent sweep
    for (let i = 0; i < n; i++) {
      const a = sigma[i][i];
      const bi = budgets[i];
      const ci = sigmaX[i] - a * x[i];

      // Stabilized quadratic root to prevent catastrophic cancellation
      const disc = ci * ci + 4 * a * bi;
      const sqrtDisc = Math.sqrt(Math.max(disc, 0));
      const xNew = ci > 0 ? (2 * bi) / (ci + sqrtDisc) : (-ci + sqrtDisc) / (2 * a);

      const deltaX = xNew - x[i];
      if (Math.abs(deltaX) > 1e-15) {
        for (let j = 0; j < n; j++) {
          sigmaX[j] += sigma[j][i] * deltaX;
        }
        x[i] = xNew;
      }
    }

    // Compute normalized weights and relative risk contributions
    const sumX = x.reduce((acc, val) => acc + val, 0);
    if (sumX <= 0) break;

    weights = x.map((val) => val / sumX);
    const sigmaW = sigmaX.map((val) => val / sumX);

    portVar = 0;
    for (let i = 0; i < n; i++) {
      portVar += weights[i] * sigmaW[i];
    }

    if (portVar <= 1e-12) break;

    riskContributions = weights.map((w, i) => (w * sigmaW[i]) / portVar);

    maxDiscrepancy = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(riskContributions[i] - budgets[i]);
      if (diff > maxDiscrepancy) {
        maxDiscrepancy = diff;
      }
    }

    if (maxDiscrepancy <= tolerance) {
      converged = true;
      break;
    }
  }

  return {
    weights,
    riskContributions,
    maxDiscrepancy,
    iterations,
    converged,
    portfolioVariance: portVar,
  };
}

export class ErcParitySolver {
  private readonly defaultTolerance: number;
  private readonly defaultMaxIterations: number;

  constructor(options: ErcSolverOptions = {}) {
    this.defaultTolerance = options.tolerance ?? 1e-4;
    this.defaultMaxIterations = options.maxIterations ?? 25;
  }

  public solve(
    covMatrix: CovarianceMatrix,
    targetBudgets?: Record<EngineId, number>,
    options?: ErcSolverOptions
  ): ErcSolverResult {
    const k = ENGINE_IDS.length;
    const tol = options?.tolerance ?? this.defaultTolerance;
    const maxIter = options?.maxIterations ?? this.defaultMaxIterations;

    const bVec = ENGINE_IDS.map((id) => {
      const b = targetBudgets?.[id] ?? 1 / k;
      return Math.max(b, 0.01);
    });
    const sumB = bVec.reduce((a, b) => a + b, 0);
    const normalizedB = bVec.map((b) => b / sumB);

    const raw = solveErcCcd(covMatrix.matrix, normalizedB, tol, maxIter);

    const weights: Partial<Record<EngineId, number>> = {};
    const riskContributions: Partial<Record<EngineId, number>> = {};

    ENGINE_IDS.forEach((id, idx) => {
      weights[id] = raw.weights[idx];
      riskContributions[id] = raw.riskContributions[idx];
    });

    return {
      weights: weights as Record<EngineId, number>,
      riskContributions: riskContributions as Record<EngineId, number>,
      maxDiscrepancy: raw.maxDiscrepancy,
      iterations: raw.iterations,
      converged: raw.converged,
      portfolioVolatility: Math.sqrt(Math.max(raw.portfolioVariance, 0)),
    };
  }
}
