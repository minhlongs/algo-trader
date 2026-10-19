/**
 * Wave 288 — Gatheral, Schied & Slynko (2012): Transient Linear Price Impact and Fredholm Integral Equations
 * Solves discretized Fredholm equation G * x = lambda * 1 subject to 1^T x = X0 via Gaussian elimination.
 */
import type {
  Gatheral2012FredholmConfig,
  Gatheral2012FredholmResult,
} from './types';

export function solveGatheral2012FredholmSchedule(
  cfg: Gatheral2012FredholmConfig,
): Gatheral2012FredholmResult {
  const {
    totalInventoryX0: X0,
    horizonSec: T,
    gridPointsN: M,
    kernelDecayGamma: gamma,
    regularizationDiagonalEps: eps,
  } = cfg;

  if (X0 <= 0 || T <= 0 || M < 3 || gamma <= 0 || gamma >= 1 || eps <= 0) {
    throw new Error('Invalid Gatheral2012FredholmConfig: requires M >= 3 and 0 < gamma < 1');
  }

  const dt = T / (M - 1);
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < M; i++) {
    const row: number[] = [];
    for (let j = 0; j < M; j++) {
      const dist = Math.abs(i - j) * dt;
      const val = i === j ? Math.pow(dt * 0.25, -gamma) + eps : Math.pow(dist, -gamma);
      row.push(val);
    }
    A.push(row);
    b.push(1.0);
  }

  // Solve A * y = 1 via Gaussian elimination
  const y = [...b];
  for (let k = 0; k < M; k++) {
    const pivot = A[k][k];
    for (let j = k; j < M; j++) A[k][j] /= pivot;
    y[k] /= pivot;
    for (let i = 0; i < M; i++) {
      if (i !== k) {
        const factor = A[i][k];
        for (let j = k; j < M; j++) A[i][j] -= factor * A[k][j];
        y[i] -= factor * y[k];
      }
    }
  }

  const sumY = y.reduce((acc, v) => acc + v, 0);
  const lambda = X0 / Math.max(1e-9, sumY);
  const trades = y.map((v) => v * lambda);
  const midIdx = Math.floor(M / 2);
  const isSymmetricU = trades[0] > trades[midIdx] && Math.abs(trades[0] - trades[M - 1]) < 1e-6;
  const cost = 0.5 * lambda * X0;

  return {
    optimalGridTrades: trades,
    lagrangeMultiplierLambda: lambda,
    isSymmetricUShape: isSymmetricU,
    quadraticTransientCost: cost,
  };
}
