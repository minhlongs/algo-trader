/**
 * Wave 253: Almgren (2003) Non-Linear Power-Law Execution Types
 * Strictly < 40 LOC, zero :any.
 */

export interface AlmgrenPowerLawV2Config {
  readonly totalSharesX0: number;
  readonly timeHorizonT: number;
  readonly eta: number;
  readonly powerAlpha: number; // typically 0.5 (square-root law)
  readonly riskLambda: number;
  readonly sigma: number;
  readonly steps?: number;
}

export interface AlmgrenPowerLawV2Result {
  readonly timeGrid: readonly number[];
  readonly inventoryTrajectory: readonly number[];
  readonly tradingSpeeds: readonly number[];
  readonly expectedShortfall: number;
  readonly varianceShortfall: number;
  readonly totalExecutionCost: number;
}
