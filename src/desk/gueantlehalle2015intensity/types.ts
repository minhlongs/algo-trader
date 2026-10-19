/**
 * Wave 272 — Guéant & Lehalle (2015): General Intensity Models for Optimal Liquidation
 * Types & Configuration Interfaces
 */

export interface GueantLehalle2015Config {
  readonly maxInventory: number;
  readonly horizonSec: number;
  readonly scaleA: number;
  readonly sensitivityKappa: number;
  readonly powerExponentBeta: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
}

export interface GeneralIntensityQuote {
  readonly inventory: number;
  readonly reservationPriceOffset: number;
  readonly optimalHalfSpread: number;
  readonly executionIntensity: number;
  readonly expectedHoldingCostRate: number;
}

export interface GueantLehalle2015Result {
  readonly quotesByInventory: readonly GeneralIntensityQuote[];
  readonly asymptoticBaseSpread: number;
  readonly intensityElasticity: number;
}
