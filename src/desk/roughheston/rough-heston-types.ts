/**
 * Type definitions for Jaisson & Rosenbaum (2015, 2016) Rough Heston Hawkes Limit.
 *
 * Microstructure nearly-unstable Hawkes processes scaling to rough fractional CIR volatility.
 * Strictly < 120 LOC, zero :any.
 */

export interface RoughHestonConfig {
  alpha: number;          // Hawkes memory exponent in (0.5, 1.0) -> H = alpha - 0.5 in (0, 0.5)
  baselineIntensity: number; // mu > 0
  branchingRatio: number; // ||phi||_1 in [0.8, 0.999] (nearly unstable)
  volOfVol: number;       // nu > 0
  meanReversion: number;  // lambda > 0
  theta: number;          // long-run variance level theta > 0
}

export interface FractionalKernelPoint {
  lag: number;
  weight: number;
}

export interface RoughHestonAssessment {
  hurstParameter: number;           // H = alpha - 0.5
  branchingRatio: number;
  fractionalMemoryKernel: number[]; // Discretized power-law weights
  instantaneousVariance: number;
  isRough: boolean;                 // H < 0.5
  stabilityMargin: number;          // 1 - branchingRatio
}

export interface RoughVolatilityTrajectory {
  times: number[];
  variances: number[];
  integratedVariance: number;
}
