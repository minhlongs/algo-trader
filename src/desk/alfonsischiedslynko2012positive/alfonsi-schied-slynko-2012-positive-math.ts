/**
 * Wave 291 — Alfonsi, Schied & Slynko (2012): Order Book Resilience and Positive Portfolio Execution
 * Solves discrete optimal trade vector under convex bi-exponential resilience kernel and verifies positivity.
 */
import type {
  AlfonsiSchiedSlynko2012Config,
  AlfonsiSchiedSlynko2012Result,
} from './types';

export function computeAlfonsiSchiedSlynko2012Positive(
  cfg: AlfonsiSchiedSlynko2012Config,
): AlfonsiSchiedSlynko2012Result {
  const {
    totalOrderSizeX0: X0,
    horizonSec: T,
    gridStepsN: N,
    fastResilienceRho1: rho1,
    slowResilienceRho2: rho2,
    fastWeightAlpha: alpha,
  } = cfg;

  if (X0 <= 0 || T <= 0 || N < 3 || rho1 <= 0 || rho2 <= 0 || alpha <= 0 || alpha >= 1) {
    throw new Error('Invalid AlfonsiSchiedSlynko2012Config: parameters out of bounds');
  }

  const dt = T / (N - 1);
  const mat: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (__, j) => {
      const tau = Math.abs(i - j) * dt;
      return alpha * Math.exp(-rho1 * tau) + (1 - alpha) * Math.exp(-rho2 * tau);
    }),
  );
  const rhs = Array.from({ length: N }, () => 1.0);

  for (let k = 0; k < N; k++) {
    const piv = mat[k][k];
    for (let j = k; j < N; j++) mat[k][j] /= piv;
    rhs[k] /= piv;
    for (let i = 0; i < N; i++) {
      if (i !== k) {
        const f = mat[i][k];
        for (let j = k; j < N; j++) mat[i][j] -= f * mat[k][j];
        rhs[i] -= f * rhs[k];
      }
    }
  }

  const sumWeights = rhs.reduce((a, b) => a + b, 0);
  const discreteTrades = rhs.map((w) => (w / sumWeights) * X0);
  const minTrade = Math.min(...discreteTrades);
  const energy = (0.5 * X0 * X0) / sumWeights;

  return {
    discreteTrades,
    minimumTradeWeight: minTrade / X0,
    satisfiesPositivePortfolioProperty: minTrade > 0,
    transientImpactEnergy: energy,
  };
}
