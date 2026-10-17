/**
 * Gatheral & Wang (2012) Mathematical Formulations.
 * Optimal liquidation under exponential decay transient impact kernel G(tau) = gamma * exp(-rho * tau).
 */

import { GatheralWangConfig, GatheralWangSchedule } from './gatheral-wang-types';

export function computeOptimalGatheralWangTrajectory(config: GatheralWangConfig): GatheralWangSchedule {
  const { totalSharesX0, horizonSecT, decayRateRho, transientImpactGamma } = config;
  const denom = decayRateRho * horizonSecT + 2;

  // Discrete jump trades at boundaries t=0 and t=T
  const deltaX0 = totalSharesX0 / denom;
  const deltaXT = totalSharesX0 / denom;

  // Constant trading speed in the interior (0, T)
  const vContinuous = (decayRateRho * totalSharesX0) / denom;

  // Expected impact cost under G(t-s) = gamma * exp(-rho*(t-s))
  // Integrated impact cost analytical closed-form:
  const cost = (transientImpactGamma * Math.pow(totalSharesX0, 2)) / (2 * denom);

  return {
    initialBlockTradeShares: deltaX0,
    terminalBlockTradeShares: deltaXT,
    continuousTradingRatePerSec: vContinuous,
    expectedExecutionCost: cost,
  };
}
