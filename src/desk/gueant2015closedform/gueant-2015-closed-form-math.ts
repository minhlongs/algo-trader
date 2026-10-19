/**
 * Wave 262: Guéant (2015) Closed-Form Approximations in Optimal Liquidation.
 * Asymptotic expansion for non-linear power impact cost H(v) = eta * |v|^(1 + alpha).
 * Strictly < 85 LOC, zero :any.
 */

import { Gueant2015Config, Gueant2015Result, GueantTrajectoryStep } from './types';

export function computeGueant2015Trajectory(cfg: Gueant2015Config): Gueant2015Result {
  const { initialShares, executionHorizon: T, steps, impactAlpha: alpha, impactEta: eta, riskAversion: gamma, volatility: sigma } = cfg;

  if (initialShares <= 0 || T <= 0 || steps <= 0 || alpha <= 0 || eta <= 0) {
    throw new Error('Invalid Gueant2015Config: parameters must be strictly positive');
  }

  const dt = T / steps;
  const pExp = (1 + alpha) / alpha;
  const trajectory: GueantTrajectoryStep[] = [];
  let cumCost = 0;

  // Perturbation coefficient for risk-aversion adjustment
  // f(t) = (gamma * sigma^2 / (2 * eta)) * (T - t) * (1 - t/T)^alpha
  const riskScale = (gamma * (sigma * sigma)) / (2 * eta);

  for (let k = 0; k <= steps; k++) {
    const t = Math.min(k * dt, T);
    const tau = Math.max(0, 1 - t / T);

    // Asymptotic closed-form inventory expansion
    const baseFraction = Math.pow(tau, pExp);
    // Perturbation vanishes at t=0 and t=T ensuring exact boundary inventory
    const pertFactor = 1 + riskScale * (t / T) * (T - t) * Math.pow(tau, alpha);
    const inventory = k === 0 ? initialShares : (k === steps ? 0 : initialShares * baseFraction * Math.max(0.001, pertFactor));

    // Trading velocity v(t) = -dq/dt
    const vBase = (initialShares * pExp / T) * Math.pow(tau, 1 / alpha);
    const tradingRate = k === steps ? 0 : vBase * pertFactor;

    // Instantaneous impact cost rate: eta * |v|^(1 + alpha)
    if (k < steps) {
      const stepCost = eta * Math.pow(Math.abs(tradingRate), 1 + alpha) * dt;
      cumCost += stepCost;
    }

    trajectory.push({
      step: k,
      time: t,
      inventory: Math.max(0, inventory),
      tradingRate,
      cumulativeSlippage: cumCost,
    });
  }

  return {
    trajectory,
    totalSlippageCost: cumCost,
    terminalInventory: trajectory[trajectory.length - 1].inventory,
    powerExponent: pExp,
    riskAdjustmentMagnitude: riskScale * T,
  };
}
