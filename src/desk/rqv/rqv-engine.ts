/**
 * Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance Engine.
 * Robust estimation of continuous diffusion and jump variation.
 * Strictly < 180 LOC, zero :any.
 */

import { RqvConfig, RqvResult } from './rqv-types';
import { RqvMath } from './rqv-math';

export class RqvEngine {
  private readonly config: RqvConfig;

  constructor(config?: Partial<RqvConfig>) {
    this.config = {
      quantileAlpha: config?.quantileAlpha ?? 0.85,
      blockLengthK: config?.blockLengthK ?? 5,
      annualizationDays: config?.annualizationDays ?? 252,
      significanceLevel: config?.significanceLevel ?? 0.05,
    };
  }

  /**
   * Estimate Realized Quantile Variance from high-frequency log returns.
   */
  public estimateFromReturns(returns: number[]): RqvResult {
    const n = returns.length;
    const k = this.config.blockLengthK;

    if (n < k) {
      return this.emptyResult();
    }

    // 1. Standard Realized Variance RV = sum(r_i^2)
    let rv = 0.0;
    for (let i = 0; i < n; i++) {
      rv += returns[i] * returns[i];
    }

    // 2. Quantile factor nu_1(alpha)
    const nu1 = RqvMath.calculateNu1(this.config.quantileAlpha);
    const nu1Sq = nu1 * nu1;

    // 3. Rolling sub-sample quantiles of length k
    let sumQuantileDiffSq = 0.0;
    let blockCount = 0;

    for (let i = k - 1; i < n; i++) {
      const windowSlice = returns.slice(i - k + 1, i + 1);
      windowSlice.sort((a, b) => a - b);

      const qHigh = RqvMath.calculateQuantile(windowSlice, this.config.quantileAlpha);
      const qLow = RqvMath.calculateQuantile(windowSlice, 1.0 - this.config.quantileAlpha);
      const diff = qHigh - qLow;

      sumQuantileDiffSq += diff * diff;
      blockCount++;
    }

    // Normalizing scale factor: (n / (blockCount * nu1^2))
    const scaleFactor = blockCount > 0 ? (n / (blockCount * nu1Sq)) : 1.0;
    const rawRqv = sumQuantileDiffSq * scaleFactor;

    // Continuous variance cannot exceed total realized variance
    const rqvContinuous = Math.min(rv, Math.max(1e-12, rawRqv));
    const jumpVar = Math.max(0.0, rv - rqvContinuous);
    const jumpFraction = rv > 0 ? (jumpVar / rv) * 100.0 : 0.0;

    // 4. Asymptotic Jump Test Z-score
    // AsyVar under null: (pi / (2 * nu1^2)) * quarticity proxy
    let quarticitySum = 0.0;
    for (let i = 0; i < n; i++) {
      quarticitySum += Math.pow(returns[i], 4);
    }
    const realizedQuarticity = (n / 3.0) * quarticitySum;
    const asyVar = Math.max(1e-12, (2.0 / 3.0) * (realizedQuarticity / n));
    const zScore = asyVar > 0 ? (rv - rqvContinuous) / Math.sqrt(asyVar) : 0.0;

    // Critical value at alpha significance
    const criticalZ = RqvMath.normalInverseCdf(1.0 - this.config.significanceLevel);
    const hasJump = zScore > criticalZ;

    const contVolAnn = Math.sqrt(rqvContinuous * this.config.annualizationDays);
    const totVolAnn = Math.sqrt(rv * this.config.annualizationDays);

    return {
      realizedVarianceTotal: rv,
      realizedQuantileVarianceContinuous: rqvContinuous,
      jumpVariance: jumpVar,
      jumpFractionPct: jumpFraction,
      jumpTestStatisticZ: zScore,
      hasSignificantJump: hasJump,
      continuousVolatilityAnnualized: contVolAnn,
      totalVolatilityAnnualized: totVolAnn,
      sampleSize: n,
      blockCount: blockCount,
      asymptoticQuantileSpreadConstant: nu1,
    };
  }

  private emptyResult(): RqvResult {
    return {
      realizedVarianceTotal: 0.0,
      realizedQuantileVarianceContinuous: 0.0,
      jumpVariance: 0.0,
      jumpFractionPct: 0.0,
      jumpTestStatisticZ: 0.0,
      hasSignificantJump: false,
      continuousVolatilityAnnualized: 0.0,
      totalVolatilityAnnualized: 0.0,
      sampleSize: 0,
      blockCount: 0,
      asymptoticQuantileSpreadConstant: 0.0,
    };
  }
}
