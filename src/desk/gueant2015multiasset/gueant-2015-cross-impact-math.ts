import { Gueant2015MultiAssetConfig, Gueant2015MultiAssetResult } from './types';

function minv(m: readonly (readonly number[])[]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    const p = Math.abs(a[i][i]) < 1e-12 ? 1e-12 : a[i][i];
    for (let j = 0; j < 2 * n; j++) a[i][j] /= p;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = a[k][i];
      for (let j = 0; j < 2 * n; j++) a[k][j] -= f * a[i][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function mm(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = a.length, res = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) res[i][j] += a[i][k] * b[k][j];
  return res;
}

function msqrt(m: readonly (readonly number[])[]): number[][] {
  const n = m.length;
  let y: number[][] = m.map((row) => [...row]);
  let z: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let iter = 0; iter < 12; iter++) {
    const yInv = minv(y), zInv = minv(z);
    y = y.map((row, i) => row.map((v, j) => 0.5 * (v + zInv[i][j])));
    z = z.map((row, i) => row.map((v, j) => 0.5 * (v + yInv[i][j])));
  }
  return y;
}

/**
 * Wave 258: Guéant (2015) Multi-Asset Cross-Impact Liquidation Math.
 * Closed-form matrix Riccati solution: S H^{-1} S = gamma * Sigma.
 * Strictly < 100 LOC, zero :any.
 */
export function computeGueantMultiAssetLiquidation(
  config: Gueant2015MultiAssetConfig
): Gueant2015MultiAssetResult {
  const { initialInventoryQ0: q0, covarianceSigma: Sigma, crossImpactH: H } = config;
  const { riskAversionGamma: gamma, executionHorizonT: T } = config;
  const n = q0.length, steps = Math.max(2, config.steps ?? 10), dt = T / steps;

  const H_inv = minv(H), H_sqrt = msqrt(H), H_sqrt_inv = minv(H_sqrt);
  const gammaSigma = Sigma.map((r) => r.map((v) => gamma * v));
  const K = mm(mm(H_sqrt_inv, gammaSigma), H_sqrt_inv);
  const S = mm(mm(H_sqrt, msqrt(K)), H_sqrt);
  const Omega = mm(H_inv, S);

  const traj: number[][] = [q0.map((v) => v)];
  let currentQ = [...q0], totalCost = 0, riskPenalty = 0, crossFriction = 0, speedNu0: number[] = [];

  for (let step = 0; step < steps; step++) {
    const remTime = Math.max(dt * 0.5, T - step * dt);
    const speed = currentQ.map((_, i) => {
      let rate = currentQ[i] / remTime;
      for (let j = 0; j < n; j++) rate += Omega[i][j] * currentQ[j];
      return Math.max(0, rate);
    });
    if (step === 0) speedNu0 = [...speed];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const costIJ = 0.5 * speed[i] * H[i][j] * speed[j] * dt;
        totalCost += costIJ;
        if (i !== j) crossFriction += Math.abs(costIJ);
        riskPenalty += 0.5 * gamma * currentQ[i] * Sigma[i][j] * currentQ[j] * dt;
      }
    }
    currentQ = currentQ.map((val, idx) => Math.max(0, val - speed[idx] * dt));
    traj.push([...currentQ]);
  }

  return {
    optimalTradingSpeedNu0: speedNu0,
    riccatiMatrixS: S,
    inventoryTrajectory: traj,
    totalExecutionCost: totalCost,
    portfolioVariancePenalty: riskPenalty,
    crossImpactFriction: crossFriction,
  };
}
