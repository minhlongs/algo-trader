/**
 * Wave 295 — Gatheral & Schied (2013): Dynamical Models of Market Impact and Algorithms for Order Execution
 * Evaluates coupled transient resilience state and permanent impact cost.
 */
import type {
  GatheralSchied2013DynamicalConfig,
  GatheralSchied2013DynamicalResult,
} from './types';

export function computeGatheralSchied2013Dynamical(
  cfg: GatheralSchied2013DynamicalConfig,
): GatheralSchied2013DynamicalResult {
  const {
    tradeRateSchedule: v,
    stepDurationDt: dt,
    transientImpactEta: eta,
    resilienceDecayRho: rho,
    permanentImpactGamma: gamma,
  } = cfg;

  if (v.length === 0 || dt <= 0 || eta <= 0 || rho <= 0 || gamma < 0) {
    throw new Error('Invalid GatheralSchied2013DynamicalConfig');
  }

  const decay = Math.exp(-rho * dt);
  let yState = 0;
  let transientCost = 0;
  let totalShares = 0;

  for (const rate of v) {
    const stepShares = rate * dt;
    const midY = yState * Math.sqrt(decay) + 0.5 * eta * stepShares;
    transientCost += midY * stepShares;
    yState = yState * decay + eta * stepShares;
    totalShares += stepShares;
  }

  const permanentCost = 0.5 * gamma * totalShares * totalShares;
  const totalCost = transientCost + permanentCost;

  return {
    terminalTransientState: yState,
    expectedTransientCost: transientCost,
    expectedPermanentCost: permanentCost,
    totalDynamicalImpactCost: totalCost,
    noPriceManipulationVerified: transientCost >= -1e-12,
  };
}
