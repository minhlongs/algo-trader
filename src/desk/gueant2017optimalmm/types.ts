/**
 * Wave 292 — Guéant (2017): Optimal Market Making with Inventory and Terminal Penalty
 * Types & Configuration Interfaces
 */

export interface Gueant2017OptimalMmConfig {
  readonly currentInventoryQ: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly orderFlowIntensityKappa: number;
  readonly baseArrivalRateA: number;
}

export interface Gueant2017OptimalMmResult {
  readonly baseHalfSpread: number;
  readonly reservationSkewPerUnit: number;
  readonly optimalBidQuoteOffset: number;
  readonly optimalAskQuoteOffset: number;
  readonly expectedSpreadCaptureRate: number;
}
