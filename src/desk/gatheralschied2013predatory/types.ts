/**
 * Wave 277 — Gatheral & Schied (2013): Dynamical Models of Market Impact and Predatory Trading
 * Types & Configuration Interfaces
 */

export interface GatheralSchied2013PredatoryConfig {
  readonly distressedInventoryQ0: number;
  readonly horizonSec: number;
  readonly steps: number;
  readonly resilienceRateRho: number;
  readonly temporaryImpactEta: number;
  readonly permanentImpactGamma: number;
  readonly predatorParticipationAlpha: number;
}

export interface PredatoryStep {
  readonly step: number;
  readonly timeSec: number;
  readonly distressedInventory: number;
  readonly predatorInventory: number;
  readonly transientPriceDisplacement: number;
  readonly distressedTradingRate: number;
  readonly predatorTradingRate: number;
}

export interface GatheralSchied2013PredatoryResult {
  readonly trajectory: readonly PredatoryStep[];
  readonly distressedExecutionCost: number;
  readonly baselineUnpredatedCost: number;
  readonly predatoryCostInflationRatio: number;
  readonly predatorExpectedProfit: number;
}
