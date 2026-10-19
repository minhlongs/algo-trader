/**
 * Wave 265: Lehalle & Neuman (2019) Incorporating the Order Book Feature in Optimal Execution.
 * Strictly < 85 LOC, zero :any.
 */

import { BookImbalanceStep, LehalleNeuman2019Config, LehalleNeuman2019Result } from './types';

export function computeLehalleNeuman2019Execution(
  cfg: LehalleNeuman2019Config,
  imbalanceSeries?: readonly number[],
): LehalleNeuman2019Result {
  const { initialInventory: Q0, executionHorizon: T, steps: N, temporaryImpactEta: eta, riskAversionPhi: phi, orderBookImbalanceBeta: beta } = cfg;

  if (Q0 <= 0 || T <= 0 || N <= 0 || eta <= 0) {
    throw new Error('Invalid LehalleNeuman2019Config: parameters must be strictly positive');
  }

  const dt = T / N;
  const kAlmgren = Math.sqrt(Math.max(1e-6, phi / eta));
  const trajectory: BookImbalanceStep[] = [];
  let currentQ = Q0;
  let totalCost = 0;
  let netDrift = 0;

  for (let step = 0; step <= N; step++) {
    const t = Math.min(step * dt, T);
    const tau = Math.max(0, T - t);
    const imb = imbalanceSeries && imbalanceSeries[step] !== undefined ? Math.max(-1, Math.min(1, imbalanceSeries[step])) : 0;
    const alphaDrift = beta * imb;

    // Almgren-Chriss baseline rate adjusted for order book imbalance alpha
    // nu*(t) = k * sinh(k*(T-t)) / cosh(k*T) * Q0 + (1 / (2*eta)) * alphaDrift
    let nu = 0;
    if (step < N && tau > 0) {
      const denom = Math.cosh(Math.max(1e-4, kAlmgren * T));
      const numer = Math.sinh(Math.max(1e-4, kAlmgren * tau));
      const almgrenRate = kAlmgren > 1e-4 ? (Q0 * kAlmgren * numer) / denom : currentQ / tau;
      // When selling, positive bid queue imbalance (imb > 0) slows liquidation or captures better price;
      // negative imbalance (imb < 0) accelerates selling before price drops
      const imbalanceAdjustment = alphaDrift / (2 * eta);
      nu = Math.max(0, almgrenRate - imbalanceAdjustment);
      // Ensure inventory doesn't overshoot below zero
      nu = Math.min(nu, currentQ / dt);
    }

    trajectory.push({ step, time: t, inventory: currentQ, tradingRate: nu, queueImbalance: imb, expectedAlphaDrift: alphaDrift });

    if (step < N) {
      const stepCost = (eta * nu * nu + 0.5 * cfg.permanentImpactGamma * nu * currentQ) * dt;
      totalCost += stepCost;
      netDrift += alphaDrift * currentQ * dt;
      currentQ = Math.max(0, currentQ - nu * dt);
    }
  }

  const avgRate = trajectory.slice(0, N).reduce((acc, s) => acc + s.tradingRate, 0) / N;

  return {
    trajectory,
    totalExecutionCost: totalCost,
    terminalInventory: trajectory[trajectory.length - 1].inventory,
    averageTradingRate: avgRate,
    netDriftBenefit: netDrift,
  };
}
