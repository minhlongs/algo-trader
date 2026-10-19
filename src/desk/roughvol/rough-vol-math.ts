/**
 * Mathematical kernels for Gatheral et al. (2018) Rough Volatility.
 * Strictly < 140 LOC, zero external dependencies, zero :any.
 */

import { VariogramPoint, MomentOrderFit } from './rough-vol-types';

export class RoughVolMath {
  /**
   * Computes empirical q-th moment variogram m(q, Delta) on log-volatility.
   */
  public static computeVariogram(
    volatilities: readonly number[],
    delta: number,
    q: number
  ): VariogramPoint {
    const n = volatilities.length;
    if (delta >= n || delta <= 0) {
      throw new Error(`Invalid lag Delta=${delta} for series length ${n}`);
    }

    let sum = 0;
    let count = 0;

    for (let i = 0; i < n - delta; i++) {
      const v1 = Math.max(1e-12, volatilities[i]);
      const v2 = Math.max(1e-12, volatilities[i + delta]);
      const diff = Math.abs(Math.log(v2) - Math.log(v1));
      sum += Math.pow(diff, q);
      count++;
    }

    const value = count > 0 ? sum / count : 1e-12;
    const safeVal = Math.max(1e-12, value);

    return {
      delta,
      logDelta: Math.log(delta),
      momentQ: q,
      value: safeVal,
      logValue: Math.log(safeVal),
    };
  }

  /**
   * Simple linear regression: y = slope * x + intercept
   */
  public static fitLinearRegression(
    points: readonly { x: number; y: number }[]
  ): { slope: number; intercept: number; rSquared: number } {
    const n = points.length;
    if (n < 2) {
      return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const xMean = points.reduce((acc, p) => acc + p.x, 0) / n;
    const yMean = points.reduce((acc, p) => acc + p.y, 0) / n;

    let ssXx = 0;
    let ssXy = 0;
    let ssYy = 0;

    for (const p of points) {
      const dx = p.x - xMean;
      const dy = p.y - yMean;
      ssXx += dx * dx;
      ssXy += dx * dy;
      ssYy += dy * dy;
    }

    const slope = ssXx > 1e-12 ? ssXy / ssXx : 0;
    const intercept = yMean - slope * xMean;
    const rSquared = (ssXx > 1e-12 && ssYy > 1e-12) ? Math.min(1.0, (ssXy * ssXy) / (ssXx * ssYy)) : 0;

    return { slope, intercept, rSquared };
  }

  /**
   * Estimates Hurst parameter H(q) from a collection of variogram points for fixed q.
   */
  public static estimateHurstForMoment(
    points: readonly VariogramPoint[],
    q: number
  ): MomentOrderFit {
    const xy = points.map(p => ({ x: p.logDelta, y: p.logValue }));
    const { slope, intercept, rSquared } = this.fitLinearRegression(xy);
    const estimatedH = q > 0 ? slope / q : 0;

    return {
      q,
      slope,
      estimatedHurstH: Math.max(0.01, estimatedH),
      intercept,
      rSquared,
    };
  }
}
