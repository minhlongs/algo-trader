/**
 * Wave 284 — Cartea, Jaimungal & Penalva (2015): Statistical Arbitrage and Pairs Trading with Execution Cost
 * Types & Configuration Interfaces
 */

export interface Cartea2015StatArbConfig {
  readonly currentSpreadX: number;
  readonly equilibriumTheta: number;
  readonly meanReversionKappa: number;
  readonly currentInventoryQ: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionPhi: number;
  readonly remainingHorizonSec: number;
}

export interface Cartea2015StatArbResult {
  readonly spreadMispricing: number;
  readonly targetEquilibriumInventory: number;
  readonly optimalTradingVelocityNu: number;
  readonly expectedConvergenceHalfLifeSec: number;
}
