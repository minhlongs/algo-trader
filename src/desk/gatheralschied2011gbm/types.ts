/**
 * Wave 289 — Gatheral & Schied (2011): Optimal Trade Execution under Geometric Brownian Motion
 * Types & Configuration Interfaces
 */

export interface GatheralSchied2011GbmConfig {
  readonly initialInventoryX0: number;
  readonly initialSpotPriceS0: number;
  readonly geometricVolatilitySigma: number;
  readonly horizonSec: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionLambda: number;
}

export interface GatheralSchied2011GbmResult {
  readonly urgencyRateKappa: number;
  readonly initialTradingRateV0: number;
  readonly midHorizonInventory: number;
  readonly expectedExecutionCost: number;
  readonly halfLifeSec: number;
}
