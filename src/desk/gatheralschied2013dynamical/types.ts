/**
 * Wave 295 — Gatheral & Schied (2013): Dynamical Models of Market Impact and Algorithms for Order Execution
 * Types & Configuration Interfaces
 */

export interface GatheralSchied2013DynamicalConfig {
  readonly tradeRateSchedule: readonly number[];
  readonly stepDurationDt: number;
  readonly transientImpactEta: number;
  readonly resilienceDecayRho: number;
  readonly permanentImpactGamma: number;
}

export interface GatheralSchied2013DynamicalResult {
  readonly terminalTransientState: number;
  readonly expectedTransientCost: number;
  readonly expectedPermanentCost: number;
  readonly totalDynamicalImpactCost: number;
  readonly noPriceManipulationVerified: boolean;
}
