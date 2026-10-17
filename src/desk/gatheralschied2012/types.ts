/**
 * Wave 254: Gatheral, Schied & Slynko (2012) Transient Decay & No-Arbitrage Types
 * Strictly < 40 LOC, zero :any.
 */

export type ImpactKernelType = 'POWER_LAW' | 'EXPONENTIAL';

export interface GatheralSchied2012Config {
  readonly kernelType: ImpactKernelType;
  readonly gammaScale: number;
  readonly decayAlpha: number; // in (0, 1)
  readonly offsetTau0: number; // >= 0
  readonly timeStepDeltaT?: number;
  readonly matrixDimensionN?: number;
}

export interface GramMatrixAssessment {
  readonly gramMatrix: readonly (readonly number[])[];
  readonly choleskyFactor: readonly (readonly number[])[];
  readonly isPositiveDefinite: boolean;
  readonly minimumPivot: number;
  readonly dynamicArbitrageFree: boolean;
}
