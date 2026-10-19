/**
 * Wave 302 — Cartea, Jaimungal & Penalva (2015): Algorithmic Market Making with Adverse Selection
 * Types & Configuration Interfaces
 */

export interface CarteaJaimungal2015AdverseConfig {
  readonly currentInventoryQ: number;
  readonly maxInventoryCapQMax: number;
  readonly fillDecayKappa: number;
  readonly adverseSelectionCostAlpha: number;
  readonly runningInventoryPenaltyPhi: number;
  readonly volatilitySigma: number;
  readonly effectiveHorizonT: number;
}

export interface CarteaJaimungal2015AdverseResult {
  readonly baselineHalfSpread: number;
  readonly inventorySkewIncrement: number;
  readonly optimalBidOffset: number;
  readonly optimalAskOffset: number;
  readonly quotedTotalSpread: number;
}
