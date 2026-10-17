/**
 * Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility Estimation Engine.
 * Tests fractional Brownian motion scaling of log-volatility and estimates Hurst exponent H.
 * Strictly < 150 LOC, zero :any.
 */

import {
  RoughVolConfig,
  RoughVolResult,
  VariogramPoint,
  MomentOrderFit,
} from './rough-vol-types';
import { RoughVolMath } from './rough-vol-math';

export class RoughVolEngine {
  private readonly config: RoughVolConfig;

  constructor(config?: Partial<RoughVolConfig>) {
    this.config = {
      deltaLags: config?.deltaLags ?? [1, 2, 3, 4, 6, 8, 12, 16, 24],
      momentOrders: config?.momentOrders ?? [1.0, 2.0],
    };
  }

  /**
   * Estimates Hurst exponent H from high-frequency volatility series.
   */
  public estimate(volatilities: readonly number[]): RoughVolResult {
    const n = volatilities.length;
    const maxLag = Math.max(...this.config.deltaLags);

    if (n < maxLag + 10) {
      throw new Error(`Time series length (${n}) must be greater than max lag + 10 (${maxLag + 10})`);
    }

    const variogramPoints: VariogramPoint[] = [];
    const momentFits: MomentOrderFit[] = [];

    for (const q of this.config.momentOrders) {
      const qPoints: VariogramPoint[] = [];
      for (const delta of this.config.deltaLags) {
        if (delta < n) {
          const pt = RoughVolMath.computeVariogram(volatilities, delta, q);
          qPoints.push(pt);
          variogramPoints.push(pt);
        }
      }

      const fit = RoughVolMath.estimateHurstForMoment(qPoints, q);
      momentFits.push(fit);
    }

    // Select q=2.0 fit or average across moment fits as primary Hurst estimate
    const q2Fit = momentFits.find(f => Math.abs(f.q - 2.0) < 1e-6) ?? momentFits[0];
    const primaryH = q2Fit?.estimatedHurstH ?? 0.14;
    const scalingC2 = Math.exp(q2Fit?.intercept ?? 0);

    return {
      sampleSize: n,
      hurstExponent: Number(primaryH.toFixed(4)),
      isRough: primaryH < 0.5,
      scalingConstantC2: Number(scalingC2.toFixed(6)),
      momentFits,
      variogramPoints,
    };
  }
}
