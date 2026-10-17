/**
 * Wave 289 — Gatheral & Schied (2011): Optimal Trade Execution under Geometric Brownian Motion
 * Computes hyperbolic execution rate and trajectory scaled by initial dollar volatility S0 * sigma.
 */
import type {
  GatheralSchied2011GbmConfig,
  GatheralSchied2011GbmResult,
} from './types';

export function computeGatheralSchied2011Gbm(
  cfg: GatheralSchied2011GbmConfig,
): GatheralSchied2011GbmResult {
  const {
    initialInventoryX0: X0,
    initialSpotPriceS0: S0,
    geometricVolatilitySigma: sigma,
    horizonSec: T,
    temporaryImpactEta: eta,
    riskAversionLambda: lambda,
  } = cfg;

  if (X0 <= 0 || S0 <= 0 || sigma <= 0 || T <= 0 || eta <= 0 || lambda <= 0) {
    throw new Error('Invalid GatheralSchied2011GbmConfig: all inputs must be strictly positive');
  }

  const dollarVarianceRate = sigma * sigma * S0 * S0;
  const kappa = Math.sqrt((lambda * dollarVarianceRate) / eta);
  const kappaT = kappa * T;
  const tanhKT = Math.tanh(kappaT);
  const v0 = (kappa * X0) / tanhKT;

  const midInventory = (X0 * Math.sinh(0.5 * kappaT)) / Math.sinh(kappaT);
  const expectedCost = (eta * kappa * X0 * X0) / tanhKT;
  const halfLifeSec = Math.LN2 / kappa;

  return {
    urgencyRateKappa: kappa,
    initialTradingRateV0: v0,
    midHorizonInventory: midInventory,
    expectedExecutionCost: expectedCost,
    halfLifeSec,
  };
}
