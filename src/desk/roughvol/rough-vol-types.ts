/**
 * Type definitions for Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility.
 * Strictly < 100 LOC, zero :any.
 */

export interface RoughVolConfig {
  readonly deltaLags: readonly number[]; // Time scale lags Delta (e.g. [1, 2, 3, 5, 8, 12, 16, 24])
  readonly momentOrders: readonly number[]; // Moment orders q (e.g. [1.0, 2.0])
}

export interface VariogramPoint {
  readonly delta: number;
  readonly logDelta: number;
  readonly momentQ: number;
  readonly value: number;
  readonly logValue: number;
}

export interface MomentOrderFit {
  readonly q: number;
  readonly slope: number;
  readonly estimatedHurstH: number;
  readonly intercept: number;
  readonly rSquared: number;
}

export interface RoughVolResult {
  readonly sampleSize: number;
  readonly hurstExponent: number; // Primary Hurst estimate (q = 2.0 or mean)
  readonly isRough: boolean;       // True if H < 0.5 (rougher than Brownian motion)
  readonly scalingConstantC2: number;
  readonly momentFits: readonly MomentOrderFit[];
  readonly variogramPoints: readonly VariogramPoint[];
}
