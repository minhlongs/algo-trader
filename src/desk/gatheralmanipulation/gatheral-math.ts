/**
 * Wave 235: Gatheral (2010) No-Dynamic-Arbitrage Mathematical Core
 * Exponential kernel G(t) = gamma * exp(-beta * t) and quadratic form cost.
 */

import { ManipulationKernelConfig, RoundTripSchedule, ManipulationAssessment } from './gatheral-types';

export function evaluateKernel(t: number, config: ManipulationKernelConfig): number {
  if (t < 0) return 0;
  return config.impactGamma * Math.exp(-config.decayRateBeta * t);
}

export function computeQuadraticExecutionCost(
  schedule: RoundTripSchedule,
  config: ManipulationKernelConfig
): ManipulationAssessment {
  const n = schedule.trades.length;
  let totalCost = 0;
  let maxCross = 0;

  for (let i = 0; i < n; i++) {
    const qi = schedule.trades[i];
    // Immediate self impact = 0.5 * G(0) * q_i^2
    totalCost += 0.5 * evaluateKernel(0, config) * qi * qi;

    for (let j = 0; j < i; j++) {
      const qj = schedule.trades[j];
      const dt = (i - j) * schedule.stepDeltaT;
      const crossImpact = evaluateKernel(dt, config) * qi * qj;
      totalCost += crossImpact;
      if (Math.abs(crossImpact) > maxCross) {
        maxCross = Math.abs(crossImpact);
      }
    }
  }

  // Under exponential / completely monotone kernels with sum(trades)=0, totalCost >= 0 always.
  const isManipulationFree = totalCost >= -1e-9;

  return {
    roundTripCost: totalCost,
    isPriceManipulationFree: isManipulationFree,
    maxTransientAdvantage: maxCross,
  };
}
