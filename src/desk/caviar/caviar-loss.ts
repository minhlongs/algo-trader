/**
 * Quantile Loss Function and Recursive State Evaluation for CAViaR.
 * Implements Koenker-Bassett (1978) check loss and autoregressive equations.
 * Strictly < 150 LOC, zero `:any` types.
 */

import { CaviarParameters, CaviarSpecification } from './caviar-types';

export class CaviarLossCalculator {
  /**
   * Evaluates conditional quantile series f_t(beta) for t = 1 ... T.
   * f_t represents the negative quantile value (VaR = -f_t when f_t < 0).
   */
  public static computeQuantileSeries(
    returns: readonly number[],
    params: CaviarParameters,
    specification: CaviarSpecification,
    quantileLevel: number
  ): number[] {
    const n = returns.length;
    if (n === 0) return [];

    const fSeries: number[] = new Array(n);
    // Initialize f_0 with empirical quantile of the first 20 observations or -2 * stdDev
    let sum = 0;
    let sumSq = 0;
    const initWindow = Math.min(n, 30);
    for (let i = 0; i < initWindow; i++) {
      sum += returns[i];
      sumSq += returns[i] * returns[i];
    }
    const mean = sum / initWindow;
    const stdDev = Math.sqrt(Math.max(1e-6, sumSq / initWindow - mean * mean));
    // Default initial quantile approximation
    if (specification === 'ADAPTIVE') {
      fSeries[0] = -1.645 * stdDev;
    } else {
      fSeries[0] = params.beta1 / (1.0 - Math.min(0.99, Math.abs(params.beta2 || 0.8)));
      if (!Number.isFinite(fSeries[0]) || fSeries[0] >= 0) {
        fSeries[0] = -1.645 * stdDev;
      }
    }

    const beta4 = params.beta4 ?? 0;

    for (let t = 1; t < n; t++) {
      const yPrev = returns[t - 1];
      const fPrev = fSeries[t - 1];

      if (specification === 'SAV') {
        fSeries[t] = params.beta1 + params.beta2 * fPrev + params.beta3 * Math.abs(yPrev);
      } else if (specification === 'AS') {
        const yPos = Math.max(0, yPrev);
        const yNeg = Math.max(0, -yPrev);
        fSeries[t] = params.beta1 + params.beta2 * fPrev + params.beta3 * yPos + beta4 * yNeg;
      } else {
        // ADAPTIVE specification (Engle-Manganelli 2004 eq. 6)
        const G = 10.0;
        const diff = yPrev - fPrev;
        const logistic = 1.0 / (1.0 + Math.exp(Math.min(50, Math.max(-50, G * diff))));
        fSeries[t] = fPrev + params.beta1 * (logistic - quantileLevel);
      }
    }

    return fSeries;
  }

  /**
   * Evaluates Koenker & Bassett (1978) check loss:
   * rho_theta(u) = u * (theta - I(u < 0))
   */
  public static computeCheckLoss(
    returns: readonly number[],
    quantileSeries: readonly number[],
    quantileLevel: number
  ): number {
    const n = returns.length;
    if (n === 0) return 0;

    let totalLoss = 0;
    for (let t = 0; t < n; t++) {
      const u = returns[t] - quantileSeries[t];
      const hit = u < 0 ? 1 : 0;
      totalLoss += u * (quantileLevel - hit);
    }
    return totalLoss / n;
  }
}
