/**
 * Wave 240: Cartea & Jaimungal (2014) Optimal Execution with Target Inventory Penalties
 * Closed-form liquidation scheduling under running penalty phi and terminal penalty alpha.
 * Strictly < 100 LOC, zero :any.
 */

export interface CarteaJaimungalLiquidationConfig {
  readonly runningInventoryPenaltyPhi: number;
  readonly terminalInventoryPenaltyAlpha: number;
  readonly temporaryImpactEta: number;
  readonly executionHorizonT: number;
}

export interface InventoryTrackingAssessment {
  readonly timeGrid: readonly number[];
  readonly optimalTradingSpeed: readonly number[];
  readonly inventoryPath: readonly number[];
  readonly totalExecutionCost: number;
}
