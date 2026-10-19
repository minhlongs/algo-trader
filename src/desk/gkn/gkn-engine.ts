import { GknParams, GknDecompositionResult } from './gkn-types.js';
import { GknMath } from './gkn-math.js';

export class GknEngine {
  public static validate(params: GknParams): void {
    if (!params.observations || params.observations.length < 10) {
      throw new Error('GKN model requires at least 10 observations');
    }
  }

  /**
   * Decomposes bid-ask spread using GKN (1991) method of moments:
   * Let R_t = P_t - P_{t-1} be transaction price returns,
   * R_t^q = M_t - M_{t-1} be quote midpoint returns.
   * Cov(R_t, R_{t-1}) = - (1 - pi)^2 * (S/2)^2 - Cov(unexpected)
   * The order processing component induces negative autocorrelation in trade returns,
   * while quote revisions purge the bid-ask bounce.
   */
  public static decomposeSpread(params: GknParams): GknDecompositionResult {
    this.validate(params);
    const obs = params.observations;
    const n = obs.length;

    const tradeReturns: number[] = [];
    const quoteMidpoints: number[] = [];
    const quotedSpreads: number[] = [];
    const effectiveSpreads: number[] = [];

    for (let t = 0; t < n; t++) {
      const mid = 0.5 * (obs[t].bid + obs[t].ask);
      const spread = obs[t].ask - obs[t].bid;
      quoteMidpoints.push(mid);
      quotedSpreads.push(spread);

      if (t > 0) {
        tradeReturns.push(obs[t].tradePrice - obs[t - 1].tradePrice);
        const effSpread = 2.0 * Math.abs(obs[t].tradePrice - mid);
        effectiveSpreads.push(effSpread);
      }
    }

    const avgQuotedSpread = GknMath.mean(quotedSpreads);
    const avgEffectiveSpread = GknMath.mean(effectiveSpreads);

    // Compute serial covariance of transaction returns
    const gamma1 = GknMath.autocovariance(tradeReturns, 1);
    const sHalf = avgQuotedSpread / 2.0;
    const sHalfSq = Math.max(1e-8, sHalf * sHalf);

    // GKN order processing fraction estimator:
    // Transitory order processing bounce = -gamma1
    // (1 - pi)^2 = max(0, -gamma1 / (sHalf^2))
    let orderProcessingFraction = 0;
    if (gamma1 < 0) {
      const ratio = -gamma1 / sHalfSq;
      orderProcessingFraction = Math.min(1.0, Math.sqrt(Math.max(0, ratio)));
    } else {
      orderProcessingFraction = 0.5; // Default neutral allocation under non-negative serial covariance
    }

    // Adverse selection fraction pi = 1 - orderProcessingFraction
    const adverseSelectionFraction = Math.max(0, 1.0 - orderProcessingFraction);
    const returnVar = GknMath.variance(tradeReturns);

    return {
      quotedSpread: avgQuotedSpread,
      effectiveSpread: avgEffectiveSpread,
      adverseSelectionFraction,
      orderProcessingFraction,
      expectedReturnVariance: Math.max(0, returnVar),
      sampleSize: n,
    };
  }
}
