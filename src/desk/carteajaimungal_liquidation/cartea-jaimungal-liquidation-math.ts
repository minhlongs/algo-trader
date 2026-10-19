/**
 * Wave 240: Cartea & Jaimungal (2014) Optimal Liquidation Math Core
 * Closed-form analytical solution for optimal liquidation under running inventory penalty phi
 * and terminal inventory penalty alpha.
 * Strictly < 80 LOC, zero :any.
 */

import {
  CarteaJaimungalLiquidationConfig,
  InventoryTrackingAssessment,
} from './cartea-jaimungal-liquidation-types';

export function computeCarteaJaimungalLiquidation(
  initialInventoryQ0: number,
  stepsN: number,
  config: CarteaJaimungalLiquidationConfig
): InventoryTrackingAssessment {
  if (stepsN <= 0) throw new Error('stepsN must be positive');
  if (config.temporaryImpactEta <= 0) throw new Error('eta must be strictly positive');
  if (config.executionHorizonT <= 0) throw new Error('T must be strictly positive');

  const dt = config.executionHorizonT / stepsN;
  const T = config.executionHorizonT;
  const zeta = Math.sqrt(Math.max(1e-8, config.runningInventoryPenaltyPhi / config.temporaryImpactEta));
  const alphaOverEta = config.terminalInventoryPenaltyAlpha / config.temporaryImpactEta;

  const denom0 = zeta * Math.cosh(zeta * T) + alphaOverEta * Math.sinh(zeta * T);

  const timeGrid: number[] = [];
  const optimalTradingSpeed: number[] = [];
  const inventoryPath: number[] = [];

  let accumulatedCost = 0;

  for (let i = 0; i <= stepsN; i++) {
    const t = i * dt;
    timeGrid.push(t);

    const tau = T - t;
    const numQ = zeta * Math.cosh(zeta * tau) + alphaOverEta * Math.sinh(zeta * tau);
    const q = denom0 > 1e-12 ? (initialInventoryQ0 * numQ) / denom0 : (initialInventoryQ0 * tau) / T;
    inventoryPath.push(q);

    if (i === stepsN) {
      optimalTradingSpeed.push(0);
      accumulatedCost += config.terminalInventoryPenaltyAlpha * q * q;
      break;
    }

    // Trading speed nu(t) = -dq/dt
    const numNu = zeta * (zeta * Math.sinh(zeta * tau) + alphaOverEta * Math.cosh(zeta * tau));
    const speed = denom0 > 1e-12 ? (initialInventoryQ0 * numNu) / denom0 : initialInventoryQ0 / T;
    optimalTradingSpeed.push(speed);

    // Running cost: temporary impact + running inventory penalty
    accumulatedCost += (config.temporaryImpactEta * speed * speed + config.runningInventoryPenaltyPhi * q * q) * dt;
  }

  return {
    timeGrid,
    optimalTradingSpeed,
    inventoryPath,
    totalExecutionCost: accumulatedCost,
  };
}
