/**
 * Wave 267: Gatheral & Schied (2013) Fractional Brownian Motion & Rough Path Optimal Liquidation Math.
 * Strictly < 85 LOC, zero :any.
 */

import { RoughLiquidationConfig, RoughLiquidationResult, RoughTrajectoryStep } from './types';

export function computeRoughLiquidation(cfg: RoughLiquidationConfig): RoughLiquidationResult {
  const { initialShares: Q0, executionHorizon: T, steps: N, hurstParameter: H, tempImpactEta: eta, riskAversionLambda: lambda } = cfg;

  if (Q0 <= 0 || T <= 0 || N <= 0 || H <= 0 || H >= 0.5 || eta <= 0 || lambda < 0) {
    throw new Error('Invalid parameters: H must be in (0, 0.5) and all rates must be positive');
  }

  const dt = T / N;
  const alpha = H - 0.5; // Negative singularity exponent alpha in (-0.5, 0)
  const trajectory: RoughTrajectoryStep[] = [];
  let totalCost = 0;

  // For rough kernel K(t) = t^alpha, optimal inventory has U-shaped trading rate
  // q(t) = Q_0 * (1 - (t/T)^(H + 0.5))
  const beta = H + 0.5;

  for (let k = 0; k <= N; k++) {
    const t = Math.min(k * dt, T);
    const tauFraction = t / T;

    // Fractional inventory trajectory
    const inventory = k === N ? 0 : Q0 * Math.max(0, 1 - Math.pow(tauFraction, beta));

    // Instantaneous trading velocity v(t) = -dq/dt = Q0 * beta / T * (t/T)^(beta - 1)
    const velocity = k === N ? 0 : (Q0 * beta / T) * Math.pow(Math.max(1e-4, tauFraction), beta - 1);

    // Power-law memory kernel weight K(t) = (t + dt)^alpha
    const kernelWeight = Math.pow(t + dt, alpha);

    // Step friction cost: eta * v^2 * dt + transient memory penalty
    const stepCost = eta * (velocity * velocity) * dt * (1 + lambda * kernelWeight);
    if (k < N) totalCost += stepCost;

    trajectory.push({
      step: k,
      time: t,
      inventory,
      tradingVelocity: velocity,
      kernelWeight,
      stepImpactCost: stepCost,
    });
  }

  return {
    trajectory,
    effectiveHurst: H,
    memoryKernelExponent: alpha,
    totalExecutionCost: totalCost,
    terminalInventory: trajectory[trajectory.length - 1].inventory,
  };
}
