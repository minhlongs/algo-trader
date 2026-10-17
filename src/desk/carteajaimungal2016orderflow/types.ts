/**
 * Wave 281 — Cartea & Jaimungal (2016): Incorporating Order-Flow into Optimal Execution
 * Types & Configuration Interfaces
 */

export interface Cartea2016OrderFlowConfig {
  readonly currentInventory: number;
  readonly remainingTimeSec: number;
  readonly netOrderFlowMu: number;
  readonly orderFlowReversionKappa: number;
  readonly permanentImpactB: number;
  readonly temporaryImpactK: number;
  readonly runningInventoryPenaltyPhi: number;
}

export interface Cartea2016OrderFlowResult {
  readonly baselineAlmgrenRate: number;
  readonly forwardOrderFlowIntegral: number;
  readonly orderFlowAdjustmentRate: number;
  readonly optimalExecutionRate: number;
}
