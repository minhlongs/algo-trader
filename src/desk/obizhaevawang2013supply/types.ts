/**
 * Wave 286 — Obizhaeva & Wang (2013): Optimal Trading Strategy and Supply/Demand Dynamics
 * Types & Configuration Interfaces
 */

export interface ObizhaevaWang2013Config {
  readonly totalOrderSizeQ0: number;
  readonly horizonSec: number;
  readonly resilienceRateRho: number;
  readonly permanentImpactLambda: number;
  readonly transientImpactKappa: number;
}

export interface ObizhaevaWang2013Result {
  readonly initialImpulseBlockX0: number;
  readonly continuousInteriorRateNu: number;
  readonly terminalImpulseBlockXT: number;
  readonly continuousVolumeShare: number;
  readonly optimalExpectedCost: number;
}
