/**
 * Wave 261: Gatheral, Schied & Slynko (2011) Exponential Transient Kernel Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface GatheralSchied2011KernelConfig {
  readonly initialSharesX0: number; // X_0
  readonly executionHorizonT: number; // T
  readonly kernelScaleG0: number; // G_0 > 0
  readonly kernelDecayBeta: number; // beta > 0
  readonly discretizationStepsN?: number; // N
}

export interface GatheralExecutionSchedule {
  readonly initialImpulseV0: number;
  readonly finalImpulseVN: number;
  readonly intermediateRate: number;
  readonly totalLiquidatedShares: number;
  readonly discreteTradeSizes: readonly number[];
  readonly discreteTimePoints: readonly number[];
  readonly impactAccumulator: readonly number[];
}

export interface EnergyVerificationResult {
  readonly quadraticEnergy: number;
  readonly isPositiveEnergy: boolean;
  readonly priceManipulationFree: boolean;
}
