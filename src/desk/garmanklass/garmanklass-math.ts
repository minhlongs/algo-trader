/**
 * Garman-Klass & Parkinson Mathematical Range Estimators
 */

import { OHLCBar } from './garmanklass-types.js';

export class GarmanKlassMath {
  public static readonly LN2 = Math.LN2;
  public static readonly PARKINSON_CONST = 1.0 / (4.0 * Math.LN2);
  public static readonly GK_CONST = 2.0 * Math.LN2 - 1.0;

  /**
   * Parkinson (1980) variance estimator:
   * (1 / (4 * ln(2) * N)) * sum( (ln(H/L))^2 )
   */
  public static computeParkinsonVariance(bars: OHLCBar[]): number {
    if (bars.length === 0) return 0;
    let sumLogRangeSq = 0;
    for (const bar of bars) {
      const u = Math.log(bar.high / bar.low);
      sumLogRangeSq += u * u;
    }
    return (this.PARKINSON_CONST / bars.length) * sumLogRangeSq;
  }

  /**
   * Garman-Klass (1980) variance estimator:
   * (1 / N) * sum( 0.5 * (ln(H/L))^2 - (2*ln(2) - 1) * (ln(C/O))^2 )
   */
  public static computeGarmanKlassVariance(bars: OHLCBar[]): number {
    if (bars.length === 0) return 0;
    let sumGK = 0;
    for (const bar of bars) {
      const u = Math.log(bar.high / bar.low);
      const c = Math.log(bar.close / bar.open);
      sumGK += 0.5 * u * u - this.GK_CONST * c * c;
    }
    return Math.max(0, sumGK / bars.length);
  }

  /**
   * Classical close-to-close sample variance of log returns:
   */
  public static computeCloseToCloseVariance(bars: OHLCBar[]): number {
    if (bars.length < 2) return 0;
    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      returns.push(Math.log(bars[i].close / bars[i - 1].close));
    }
    const mean = returns.reduce((acc, r) => acc + r, 0) / returns.length;
    const sumSqDiff = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0);
    return sumSqDiff / (returns.length - 1);
  }
}
