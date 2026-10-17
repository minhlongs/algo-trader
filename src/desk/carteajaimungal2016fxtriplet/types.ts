/**
 * Wave 296 — Cartea, Jaimungal & Kinzebulatov (2016): FX Triplet Cross-Rate Arbitrage
 * Types & Configuration Interfaces
 */

export interface CarteaJaimungal2016FxTripletConfig {
  readonly spotRateXY: number;
  readonly spotRateYZ: number;
  readonly spotRateXZ: number;
  readonly meanReversionKappa: number;
  readonly temporaryImpactEta: number;
  readonly inventoryPenaltyPhi: number;
  readonly netTripletInventoryQ: number;
}

export interface CarteaJaimungal2016FxTripletResult {
  readonly syntheticCrossRateXZ: number;
  readonly logTriangularMispricingBps: number;
  readonly alphaSignalVelocity: number;
  readonly inventoryDampingVelocity: number;
  readonly optimalTripletExecutionRate: number;
}
