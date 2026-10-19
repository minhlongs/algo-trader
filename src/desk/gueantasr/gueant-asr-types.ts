/**
 * Wave 223: Guéant (2015) Accelerated Share Repurchase (ASR) Execution Types.
 *
 * Strictly < 40 LOC, zero :any.
 */

export interface GueantAsrConfig {
  totalSharesX0: number;
  horizonSec: number;
  temporaryImpactEta: number;
  inventoryRiskGamma: number;
  volatilitySigma: number;
}

export interface AsrTrajectoryPoint {
  timeSec: number;
  remainingShares: number;
  optimalVelocitySharesPerSec: number;
  cumulativeCostPenalty: number;
}
