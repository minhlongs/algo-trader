/**
 * Parkinson (1980) High-Low Extreme Value Volatility Mathematical Formulae
 *
 * sigma_P^2 = (1 / (4 * ln(2) * N)) * sum_{i=1}^N [ln(H_i / L_i)]^2
 */

import { ParkinsonBar } from './parkinson-types.js';

export class ParkinsonMath {
  private static readonly DENOMINATOR_FACTOR = 4.0 * Math.LN2; // ≈ 2.772588722239781

  /**
   * Computes periodic Parkinson variance:
   * Var_P = sum_{i=1}^N [ln(H_i / L_i)]^2 / (4 * ln(2) * N)
   */
  public static computeParkinsonVariance(bars: ParkinsonBar[]): number {
    const N = bars.length;
    if (N === 0) return 0;

    let sumSquaredLogRange = 0.0;
    for (const b of bars) {
      const logRange = Math.log(b.high / b.low);
      sumSquaredLogRange += logRange * logRange;
    }

    return Math.max(0, sumSquaredLogRange / (this.DENOMINATOR_FACTOR * N));
  }

  /**
   * Classical close-to-close variance for benchmarking efficiency:
   */
  public static computeCloseToCloseVariance(closes: number[]): number {
    const N = closes.length;
    if (N < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < N; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    let varSum = 0;
    for (const r of returns) {
      const diff = r - mean;
      varSum += diff * diff;
    }

    return varSum / (returns.length - 1);
  }
}
