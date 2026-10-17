/**
 * Wave 225: Donier et al. (2015) Dynamical Theory of Market Impact Math.
 *
 * Models square-root impact and the critical velocity liquidity hole phase transition.
 * Strictly < 80 LOC, zero mocks, zero :any.
 */

import type { DonierImpactConfig, ImpactRegimeAssessment } from './donier-impact-types';

export class DonierImpactMath {
  public static computeCriticalVelocity(config: DonierImpactConfig): number {
    return config.orderFluxJ / Math.max(1e-6, config.latentLiquidityDensityRho);
  }

  public static computeSquareRootImpact(config: DonierImpactConfig, metaorderShares: number): number {
    const fraction = metaorderShares / Math.max(1.0, config.dailyVolumeV);
    return config.dimensionlessYFactor * config.dailyVolatilitySigma * Math.sqrt(Math.max(0, fraction));
  }

  public static evaluateRegime(
    config: DonierImpactConfig,
    metaorderShares: number,
    executionDurationSec: number
  ): ImpactRegimeAssessment {
    const vTrading = metaorderShares / Math.max(1.0, executionDurationSec);
    const vCrit = this.computeCriticalVelocity(config);
    const sqrtImpact = this.computeSquareRootImpact(config, metaorderShares);
    const holeTriggered = vTrading > vCrit;

    // In the regular regime (v <= vCrit), impact is square-root.
    // If v > vCrit, extra non-linear penalty kicks in from liquidity exhaustion.
    const nonLinearMultiplier = holeTriggered ? 1.0 + Math.pow((vTrading - vCrit) / vCrit, 1.5) : 1.0;
    const finalImpactFraction = sqrtImpact * nonLinearMultiplier;
    const slippageBps = finalImpactFraction * 10_000;

    return {
      metaorderShares,
      squareRootImpactFraction: Number(sqrtImpact.toFixed(6)),
      tradingVelocitySharesPerSec: Number(vTrading.toFixed(2)),
      criticalVelocitySharesPerSec: Number(vCrit.toFixed(2)),
      isEndogenousLiquidityHoleTriggered: holeTriggered,
      effectiveSlippageBps: Number(slippageBps.toFixed(2)),
    };
  }
}
