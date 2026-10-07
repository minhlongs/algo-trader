/**
 * Prediction Market Statistical Arbitrage Engine Types
 *
 * Types for cointegration estimation, spread modeling, and execution signals.
 *
 * @module desk/arbitrage/pm-statarb-types
 */

export interface PriceObservation {
  readonly timestamp: number;
  readonly priceA: number;
  readonly priceB: number;
}

export interface StatArbConfig {
  readonly minObservations?: number;
  readonly entryZScore?: number;
  readonly exitZScore?: number;
  readonly stopLossZScore?: number;
  readonly maxHalfLifePeriods?: number;
}

export interface SpreadModel {
  readonly hedgeRatio: number; // beta from OLS regression: priceA = alpha + beta * priceB
  readonly intercept: number;
  readonly meanSpread: number;
  readonly spreadStdDev: number;
  readonly halfLifePeriods: number;
  readonly isCointegrated: boolean;
}

export type StatArbSignalDirection = 'LONG_SPREAD' | 'SHORT_SPREAD' | 'CLOSE' | 'NO_SIGNAL';

export interface StatArbSignal {
  readonly pairId: string;
  readonly timestamp: number;
  readonly direction: StatArbSignalDirection;
  readonly currentSpread: number;
  readonly zScore: number;
  readonly hedgeRatio: number;
  readonly confidence: number;
}
