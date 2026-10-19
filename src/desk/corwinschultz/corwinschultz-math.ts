/**
 * Corwin-Schultz (2012) High-Low Spread Mathematical Formulas
 */

import { CorwinSchultzBar } from './corwinschultz-types.js';

export class CorwinSchultzMath {
  private static readonly SQRT_2 = Math.SQRT2;
  private static readonly CONST_C = 3.0 - 2.0 * Math.SQRT2; // 3 - 2*sqrt(2) ≈ 0.171572875

  /**
   * Computes beta_t for two consecutive bars:
   * beta = [ln(H_t / L_t)]^2 + [ln(H_{t+1} / L_{t+1})]^2
   */
  public static computeBeta(bar1: CorwinSchultzBar, bar2: CorwinSchultzBar): number {
    const range1 = Math.log(bar1.high / bar1.low);
    const range2 = Math.log(bar2.high / bar2.low);
    return range1 * range1 + range2 * range2;
  }

  /**
   * Computes gamma_t for two consecutive bars over the combined 2-day period:
   * H_{t, t+1} = max(H_t, H_{t+1})
   * L_{t, t+1} = min(L_t, L_{t+1})
   * gamma = [ln(H_{t, t+1} / L_{t, t+1})]^2
   */
  public static computeGamma(bar1: CorwinSchultzBar, bar2: CorwinSchultzBar): number {
    const combinedHigh = Math.max(bar1.high, bar2.high);
    const combinedLow = Math.min(bar1.low, bar2.low);
    const combinedRange = Math.log(combinedHigh / combinedLow);
    return combinedRange * combinedRange;
  }

  /**
   * Computes alpha:
   * alpha = [sqrt(2*beta) - sqrt(beta)] / (3 - 2*sqrt(2)) - sqrt(gamma / (3 - 2*sqrt(2)))
   * Simplifies to:
   * alpha = ( (sqrt(2) - 1) * sqrt(beta) - sqrt(gamma) ) / (3 - 2*sqrt(2))
   */
  public static computeAlpha(beta: number, gamma: number): number {
    const num = (this.SQRT_2 - 1.0) * Math.sqrt(Math.max(0, beta)) - Math.sqrt(Math.max(0, gamma));
    return num / this.CONST_C;
  }

  /**
   * Computes relative spread S:
   * S = 2 * (exp(alpha) - 1) / (1 + exp(alpha))
   */
  public static computeSpreadFromAlpha(alpha: number, clampNegative: boolean = true): number {
    if (alpha <= 0 && clampNegative) {
      return 0.0;
    }
    const expAlpha = Math.exp(alpha);
    const spread = (2.0 * (expAlpha - 1.0)) / (1.0 + expAlpha);
    return clampNegative ? Math.max(0.0, spread) : spread;
  }

  /**
   * Computes high-low range-derived volatility sigma:
   * sigma = (sqrt(2*beta) - sqrt(beta)) / (3 - 2*sqrt(2)) * sqrt(1 / (k_2^2 * dt))
   * Or per Corwin-Schultz (2012) eq (15):
   * sigma_HL = [ sqrt(beta/2) - alpha * sqrt(1/(2*k2^2)) ] or standard range-based proxy.
   * Standard range volatility component: sqrt(beta / (2 * (4 * ln(2))))
   */
  public static computeRangeVolatility(beta: number): number {
    // Parkinson range factor: k2 = sqrt(8 / pi) or variance factor 4*ln(2)
    // For 2 days combined beta = 2 * sigma_daily^2 * (4 ln 2)
    const factor = 4.0 * Math.LN2;
    const dailyVariance = Math.max(0, beta) / (2.0 * factor);
    return Math.sqrt(dailyVariance * 252.0); // annualized
  }
}
