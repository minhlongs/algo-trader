/**
 * Wave 290 — Cartea, Donnelly & Jaimungal (2017): Algorithmic Trading with Model Uncertainty
 * Types & Configuration Interfaces
 */

export interface CarteaDonnellyJaimungal2017Config {
  readonly currentInventoryQ: number;
  readonly remainingHorizonSec: number;
  readonly volatilitySigma: number;
  readonly temporaryImpactEta: number;
  readonly inventoryPenaltyPhiInv: number;
  readonly driftAmbiguityPenaltyPhiDrift: number;
}

export interface CarteaDonnellyJaimungal2017Result {
  readonly effectiveUrgencyKappa: number;
  readonly baselineNeutralRate: number;
  readonly robustAmbiguityRate: number;
  readonly worstCaseDriftAdjustment: number;
  readonly urgencyAccelerationRatio: number;
}
