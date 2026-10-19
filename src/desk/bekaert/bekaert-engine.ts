/**
 * Wave 210: Bekaert, Hoerova & Lo Duca (2013) VIX Decomposition Engine.
 * Evaluates stock market volatility decomposition into economic uncertainty vs risk aversion.
 * Strictly < 180 LOC, zero :any.
 */

import { BekaertConfig, BekaertResult } from './bekaert-types';
import { BekaertMath } from './bekaert-math';

export class BekaertEngine {
  private readonly config: BekaertConfig;

  constructor(config?: Partial<BekaertConfig>) {
    this.config = {
      annualizationFactor: config?.annualizationFactor ?? 252.0,
      unconditionalVarianceScale: config?.unconditionalVarianceScale ?? 0.85,
    };
  }

  /**
   * Decomposes VIX into physical economic uncertainty and variance risk premium (risk aversion).
   * @param vixIndex Current VIX index level (e.g. 19.5)
   * @param historicalDailyRealizedVariances Array of past daily realized variances
   */
  public evaluate(
    vixIndex: number,
    historicalDailyRealizedVariances: number[]
  ): BekaertResult {
    if (vixIndex <= 0) {
      throw new Error(`Invalid VIX level: ${vixIndex}. Must be positive.`);
    }

    const vixDecimal = vixIndex / 100.0;
    const vixSquaredAnnualized = vixDecimal * vixDecimal;

    const expRvAnnualized = BekaertMath.forecastPhysicalVariance(
      historicalDailyRealizedVariances,
      vixSquaredAnnualized
    );

    const { vixSquared, vrp, uncertainty, riskAversionIndex } = BekaertMath.decomposeVix(
      vixIndex,
      expRvAnnualized
    );

    const uncertaintySharePct = vixSquared > 0 ? (expRvAnnualized / vixSquared) * 100.0 : 0.0;
    const vrpSharePct = vixSquared > 0 ? (vrp / vixSquared) * 100.0 : 0.0;

    let sentiment: BekaertResult['marketSentiment'] = 'EQUILIBRIUM';
    if (vrpSharePct < 0.0) {
      sentiment = 'RISK_SEEKING';
    } else if (vrpSharePct > 45.0 || vixIndex > 35.0) {
      sentiment = 'PANIC_SPREAD';
    } else if (vrpSharePct > 25.0) {
      sentiment = 'ELEVATED_RISK_AVERSION';
    }

    return {
      vixSquaredAnnualized: vixSquared,
      expectedRealizedVarianceAnnualized: expRvAnnualized,
      economicUncertainty: uncertainty,
      varianceRiskPremium: vrp,
      riskAversionIndex,
      uncertaintySharePct,
      vrpSharePct,
      marketSentiment: sentiment,
    };
  }
}
