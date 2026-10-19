/**
 * Wave 259: Alfonsi, Schied & Slynko (2012) Resilient Non-Linear Order Book Impact Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface AlfonsiSchied2012Config {
  readonly initialPrice: number;
  readonly totalShares: number;
  readonly executionHorizon: number; // T
  readonly steps: number; // N
  readonly resilienceRate: number; // rho > 0
  readonly impactGamma: number; // gamma (e.g. 0.5 or 1.0)
  readonly impactScaleLambda?: number; // lambda > 0
}

export interface AlfonsiTrajectoryStep {
  readonly step: number;
  readonly time: number;
  readonly tradeSize: number;
  readonly remainingShares: number;
  readonly priceDeviation: number;
  readonly executionPrice: number;
}

export interface AlfonsiSchied2012Result {
  readonly trajectory: readonly AlfonsiTrajectoryStep[];
  readonly totalExecutionCost: number;
  readonly averageExecutionPrice: number;
  readonly terminalPriceDeviation: number;
  readonly decayFactor: number;
}
