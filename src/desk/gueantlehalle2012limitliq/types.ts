/**
 * Wave 298 — Guéant, Lehalle & Fernandez-Tapia (2012): Optimal Portfolio Liquidation with Limit Orders
 * Types & Configuration Interfaces
 */

export interface GueantLehalle2012LimitLiqConfig {
  readonly remainingInventoryQ: number;
  readonly remainingHorizonT: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly orderFillDecayKappa: number;
  readonly baseArrivalIntensityA: number;
  readonly terminalSweepPenaltyB: number;
}

export interface GueantLehalle2012LimitLiqResult {
  readonly asymptoticLimitOffset: number;
  readonly urgencyDiscountAdjustment: number;
  readonly optimalAskPostingOffset: number;
  readonly instantaneousFillIntensity: number;
  readonly expectedStepLiquidationRate: number;
}
