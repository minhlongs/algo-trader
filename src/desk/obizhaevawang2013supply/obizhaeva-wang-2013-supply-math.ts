/**
 * Wave 286 — Obizhaeva & Wang (2013): Optimal Trading Strategy and Supply/Demand Dynamics
 * Exact closed-form block-continuous-block optimal schedule under exponential LOB resilience.
 */
import type {
  ObizhaevaWang2013Config,
  ObizhaevaWang2013Result,
} from './types';

export function computeObizhaevaWang2013Supply(
  cfg: ObizhaevaWang2013Config,
): ObizhaevaWang2013Result {
  const {
    totalOrderSizeQ0: Q0,
    horizonSec: T,
    resilienceRateRho: rho,
    permanentImpactLambda: lambda,
    transientImpactKappa: kappa,
  } = cfg;

  if (Q0 <= 0 || T <= 0 || rho <= 0 || lambda < 0 || kappa <= 0) {
    throw new Error('Invalid ObizhaevaWang2013Config: parameters must be positive');
  }

  const denom = rho * T + 2;
  const x0 = Q0 / denom;
  const nu = (rho * Q0) / denom;
  const xT = x0;
  const contShare = (nu * T) / Q0;

  // Canonical Obizhaeva-Wang expected execution cost: 0.5 * lambda * Q0^2 + kappa * Q0^2 / (rho * T + 2)
  const expectedCost = 0.5 * lambda * Q0 * Q0 + (kappa * Q0 * Q0) / denom;

  return {
    initialImpulseBlockX0: x0,
    continuousInteriorRateNu: nu,
    terminalImpulseBlockXT: xT,
    continuousVolumeShare: contShare,
    optimalExpectedCost: expectedCost,
  };
}
