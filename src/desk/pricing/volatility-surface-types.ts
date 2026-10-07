/**
 * Volatility Surface Types
 *
 * Contracts for binary option implied volatility inversion,
 * moneyness smile calibration, and term structure modeling.
 *
 * @module desk/pricing/volatility-surface-types
 */

export interface BinaryOptionQuote {
  readonly strike: number;
  readonly spotPrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRate: number;
  readonly binaryPrice: number; // Probability p in (0, 1)
}

export interface ImpliedVolPoint {
  readonly strike: number;
  readonly moneyness: number; // ln(K / S)
  readonly impliedVol: number;
  readonly timeToExpiryYears: number;
}

export interface VolatilitySmileFit {
  readonly a: number; // Level: sigma(0)
  readonly b: number; // Skew
  readonly c: number; // Convexity / smile curvature
  readonly rSquared: number;
  readonly fittedPoints: readonly ImpliedVolPoint[];
}

export interface VolatilitySurfaceGrid {
  readonly spotPrice: number;
  readonly riskFreeRate: number;
  readonly smilesByExpiry: ReadonlyMap<number, VolatilitySmileFit>;
}
