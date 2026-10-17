/**
 * Wave 288 — Gatheral, Schied & Slynko (2012): Transient Linear Price Impact and Fredholm Integral Equations
 * Types & Configuration Interfaces
 */

export interface Gatheral2012FredholmConfig {
  readonly totalInventoryX0: number;
  readonly horizonSec: number;
  readonly gridPointsN: number;
  readonly kernelDecayGamma: number;
  readonly regularizationDiagonalEps: number;
}

export interface Gatheral2012FredholmResult {
  readonly optimalGridTrades: readonly number[];
  readonly lagrangeMultiplierLambda: number;
  readonly isSymmetricUShape: boolean;
  readonly quadraticTransientCost: number;
}
