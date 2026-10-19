/**
 * Wave 301 — Almgren & Chriss (2000): Optimal Execution of Portfolio Transactions with Drift
 * Computes drift-adjusted hyperbolic liquidation schedule and initial execution speed.
 */
import type {
  AlmgrenChriss2000DriftConfig,
  AlmgrenChriss2000DriftResult,
} from './types';

export function computeAlmgrenChriss2000Drift(
  cfg: AlmgrenChriss2000DriftConfig,
): AlmgrenChriss2000DriftResult {
  const {
    initialInventoryQ0: Q0,
    liquidationHorizonT: T,
    riskAversionLambda: lambda,
    volatilitySigma: sigma,
    temporaryImpactEta: eta,
    expectedPriceDriftAlpha: alpha,
  } = cfg;

  if (Q0 <= 0 || T <= 0 || lambda <= 0 || sigma <= 0 || eta <= 0) {
    throw new Error('Invalid AlmgrenChriss2000DriftConfig');
  }

  const kappa = Math.sqrt((lambda * sigma * sigma) / eta);
  const sinhKT = Math.sinh(kappa * T);
  const coshKT = Math.cosh(kappa * T);
  const neutralRate = Q0 * ((kappa * coshKT) / sinhKT);
  const driftAdj = -(alpha / (2 * eta * kappa)) * Math.tanh(0.5 * kappa * T);
  const optimalRate = neutralRate + driftAdj;

  const halfT = 0.5 * T;
  const midpointNeutralQ = Q0 * (Math.sinh(kappa * (T - halfT)) / sinhKT);
  const midpointDriftQ =
    (alpha / (2 * lambda * sigma * sigma)) *
    (1 - (Math.sinh(kappa * (T - halfT)) + Math.sinh(kappa * halfT)) / sinhKT);

  return {
    urgencyKappa: kappa,
    driftNeutralInitialRate: neutralRate,
    driftAdjustmentRate: driftAdj,
    optimalInitialExecutionRate: optimalRate,
    midpointRemainingInventory: midpointNeutralQ + midpointDriftQ,
  };
}
