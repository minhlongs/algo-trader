/**
 * Wave 301 — Almgren & Chriss (2000): Optimal Execution of Portfolio Transactions with Drift
 * Types & Configuration Interfaces
 */

export interface AlmgrenChriss2000DriftConfig {
  readonly initialInventoryQ0: number;
  readonly liquidationHorizonT: number;
  readonly riskAversionLambda: number;
  readonly volatilitySigma: number;
  readonly temporaryImpactEta: number;
  readonly expectedPriceDriftAlpha: number;
}

export interface AlmgrenChriss2000DriftResult {
  readonly urgencyKappa: number;
  readonly driftNeutralInitialRate: number;
  readonly driftAdjustmentRate: number;
  readonly optimalInitialExecutionRate: number;
  readonly midpointRemainingInventory: number;
}
