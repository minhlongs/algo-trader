/**
 * Wave 225: Donier et al. (2015) Dynamical Theory of Market Impact Types.
 *
 * Strictly < 40 LOC, zero :any.
 */

export interface DonierImpactConfig {
  dailyVolatilitySigma: number;
  dailyVolumeV: number;
  dimensionlessYFactor: number;
  latentLiquidityDensityRho: number;
  orderFluxJ: number;
}

export interface ImpactRegimeAssessment {
  metaorderShares: number;
  squareRootImpactFraction: number;
  tradingVelocitySharesPerSec: number;
  criticalVelocitySharesPerSec: number;
  isEndogenousLiquidityHoleTriggered: boolean;
  effectiveSlippageBps: number;
}
