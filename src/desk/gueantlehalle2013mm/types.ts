/**
 * Wave 278 — Guéant, Lehalle & Fernandez-Tapia (2013): Dealing with the Inventory Risk
 * Types & Configuration Interfaces
 */

export interface GueantLehalle2013MmConfig {
  readonly maxInventoryCapQ: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly orderBookIntensityA: number;
  readonly orderBookDecayKappa: number;
}

export interface InventoryBoundedQuote {
  readonly inventory: number;
  readonly optimalBidSpread: number | null;
  readonly optimalAskSpread: number | null;
  readonly reservationPriceSkew: number;
  readonly asymptoticValueCoeff: number;
}

export interface GueantLehalle2013MmResult {
  readonly quotes: readonly InventoryBoundedQuote[];
  readonly neutralFullSpread: number;
  readonly maxInventorySkewWidth: number;
}
