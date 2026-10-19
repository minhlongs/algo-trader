/**
 * Wave 235: Gatheral (2010) No-Dynamic-Arbitrage & Price Manipulation
 * Strictly < 150 LOC, zero :any.
 */

export interface ManipulationKernelConfig {
  readonly decayRateBeta: number;
  readonly impactGamma: number;
}

export interface RoundTripSchedule {
  readonly trades: readonly number[];
  readonly stepDeltaT: number;
}

export interface ManipulationAssessment {
  readonly roundTripCost: number;
  readonly isPriceManipulationFree: boolean;
  readonly maxTransientAdvantage: number;
}
