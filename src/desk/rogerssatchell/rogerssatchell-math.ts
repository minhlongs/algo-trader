/**
 * Rogers-Satchell (1991) Range Volatility Formulae
 *
 * Rogers-Satchell estimator allows non-zero drift mu != 0:
 * sigma_RS^2 = (1/N) * sum_{i=1}^N [ ln(H_i / C_i) * ln(H_i / O_i) + ln(L_i / C_i) * ln(L_i / O_i) ]
 */

import { RogersSatchellBar } from './rogerssatchell-types.js';

export class RogersSatchellMath {
  public static computeRSVariance(bars: RogersSatchellBar[]): number {
    const N = bars.length;
    if (N === 0) return 0;

    let sum = 0;
    for (const b of bars) {
      const u = Math.log(b.high / b.open);
      const d = Math.log(b.low / b.open);
      const c = Math.log(b.close / b.open);

      // Equivalent formulation: u*(u - c) + d*(d - c)
      // = ln(H/O) * ln(H/C) + ln(L/O) * ln(L/C)
      const term = u * (u - c) + d * (d - c);
      sum += term;
    }

    return Math.max(0, sum / N);
  }

  public static computeCloseToCloseVariance(bars: RogersSatchellBar[]): number {
    const N = bars.length;
    if (N < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < N; i++) {
      returns.push(Math.log(bars[i].close / bars[i - 1].close));
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
