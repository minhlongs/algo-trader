/**
 * Wave 303 — Gatheral & Jacquier (2014): Arbitrage-Free SVI Volatility Surfaces
 * Types & Configuration Interfaces
 */

export interface GatheralJacquier2014SviConfig {
  readonly logMoneynessK: number;
  readonly levelA: number;
  readonly slopeB: number;
  readonly correlationRho: number;
  readonly shiftM: number;
  readonly curvatureSigma: number;
}

export interface GatheralJacquier2014SviResult {
  readonly totalImpliedVarianceW: number;
  readonly firstDerivativeWPrime: number;
  readonly secondDerivativeWDoublePrime: number;
  readonly durrlemanButterflyDensityG: number;
  readonly rogerLeeWingSlopeBoundValid: boolean;
  readonly isButterflyArbitrageFree: boolean;
}
