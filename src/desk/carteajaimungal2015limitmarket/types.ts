/**
 * Wave 271 — Cartea & Jaimungal (2015): Optimal Execution with Limit and Market Orders
 * Types & Configuration Interfaces
 */

export interface Cartea2015LimitMarketConfig {
  readonly initialInventory: number;
  readonly horizonSec: number;
  readonly steps: number;
  readonly limitFillIntensityLambda: number;
  readonly limitFillDecayKappa: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionPhi: number;
}

export interface LimitMarketStep {
  readonly step: number;
  readonly timeSec: number;
  readonly inventory: number;
  readonly optimalLimitSpread: number;
  readonly expectedLimitFillRate: number;
  readonly marketOrderRate: number;
  readonly totalLiquidationRate: number;
}

export interface Cartea2015LimitMarketResult {
  readonly trajectory: readonly LimitMarketStep[];
  readonly passiveLimitShareRatio: number;
  readonly totalSpreadCaptured: number;
  readonly totalMarketImpactCost: number;
  readonly terminalInventory: number;
}
