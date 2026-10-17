/**
 * Wave 241: Almgren & Chriss (2000) Non-Linear Power-Law Execution Types
 * Strictly < 60 LOC, zero :any.
 */

export interface AlmgrenPowerLawConfig {
  totalInventoryX0: number;
  timeHorizonT: number;
  temporaryImpactEta: number;
  powerExponentDelta: number; // typically 0.5 (square-root) or 1.0 (linear)
  riskAversionLambda: number;
  priceVolatilitySigma: number;
}

export interface AlmgrenPowerLawSchedule {
  timeGrid: number[];
  inventoryPath: number[];
  tradingSpeedPath: number[];
  expectedShortfall: number;
  varianceShortfall: number;
  totalCostOfRisk: number;
}
