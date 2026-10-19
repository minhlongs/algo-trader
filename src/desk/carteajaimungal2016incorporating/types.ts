/**
 * Wave 299 — Cartea & Jaimungal (2016): Incorporating Order-Flow into Optimal Execution
 * Types & Configuration Interfaces
 */

export interface CarteaJaimungal2016IncorporatingConfig {
  readonly currentInventoryQ: number;
  readonly remainingHorizonT: number;
  readonly temporaryImpactEta: number;
  readonly runningInventoryPenaltyPhi: number;
  readonly netOrderFlowRateMu: number;
  readonly orderFlowMeanReversionKappa: number;
  readonly permanentCoImpactBeta: number;
}

export interface CarteaJaimungal2016IncorporatingResult {
  readonly urgencyRateGamma: number;
  readonly baselineAcExecutionRate: number;
  readonly orderFlowSignalAdjustment: number;
  readonly optimalExecutionRate: number;
  readonly frontRunningAcceleratesSell: boolean;
}
