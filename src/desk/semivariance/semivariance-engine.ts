/**
 * Wave 208: Barndorff-Nielsen, Kinnebrock & Shephard (2010) Semivariance Engine.
 * Evaluates high-frequency realized upside/downside semi-variation and signed jumps.
 * Strictly < 180 LOC, zero :any.
 */

import { SemivarianceConfig, SemivarianceResult } from './semivariance-types';
import { SemivarianceMath } from './semivariance-math';

export class SemivarianceEngine {
  private readonly config: SemivarianceConfig;

  constructor(config?: Partial<SemivarianceConfig>) {
    this.config = {
      annualizationFactor: config?.annualizationFactor ?? 252.0,
      sampleFrequencyMinutes: config?.sampleFrequencyMinutes ?? 5.0,
      significanceAlpha: config?.significanceAlpha ?? 0.05,
    };
  }

  /**
   * Evaluates realized semivariances and signed jumps from high-frequency intraday log returns.
   */
  public evaluate(returns: number[]): SemivarianceResult {
    if (!returns || returns.length < 2) {
      throw new Error('At least 2 return observations required for semivariance analysis.');
    }

    const { rv, rsPlus, rsMinus } = SemivarianceMath.calculateSignedSemivariance(returns);
    const bv = SemivarianceMath.calculateBipowerVariation(returns);
    const { signedJump, upsideJump, downsideJump } = SemivarianceMath.calculateJumpComponents(
      rsPlus,
      rsMinus,
      bv
    );

    const asymmetryRatio = rv > 0 ? (rsPlus - rsMinus) / rv : 0.0;
    const negativeToPositiveRatio = rsPlus > 0 ? rsMinus / rsPlus : (rsMinus > 0 ? Infinity : 1.0);

    const factor = this.config.annualizationFactor;
    const annualizedTotalVol = Math.sqrt(Math.max(0.0, rv * factor));
    const annualizedGoodVol = Math.sqrt(Math.max(0.0, 2.0 * rsPlus * factor));
    const annualizedBadVol = Math.sqrt(Math.max(0.0, 2.0 * rsMinus * factor));

    let regime: SemivarianceResult['volatilityRegime'] = 'BALANCED';
    if (asymmetryRatio > 0.15) {
      regime = 'GOOD_VOLATILITY';
    } else if (asymmetryRatio < -0.15) {
      regime = 'BAD_VOLATILITY';
    }

    const jumpDetected = Math.abs(rv - bv) > 0.1 * rv && (upsideJump > 0 || downsideJump > 0);

    return {
      sampleSize: returns.length,
      realizedVariance: rv,
      positiveSemivariance: rsPlus,
      negativeSemivariance: rsMinus,
      bipowerVariation: bv,
      signedJumpVariation: signedJump,
      upsideJumpVariation: upsideJump,
      downsideJumpVariation: downsideJump,
      asymmetryRatio,
      negativeToPositiveRatio,
      annualizedTotalVol,
      annualizedGoodVol,
      annualizedBadVol,
      volatilityRegime: regime,
      jumpDetected,
    };
  }
}
