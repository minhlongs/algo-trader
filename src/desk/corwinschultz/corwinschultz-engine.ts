/**
 * Corwin-Schultz (2012) High-Low Bid-Ask Spread Estimator Engine
 */

import {
  CorwinSchultzBar,
  CorwinSchultzConfig,
  CorwinSchultzResult,
} from './corwinschultz-types.js';
import { CorwinSchultzMath } from './corwinschultz-math.js';

export class CorwinSchultzEngine {
  public static validateBars(bars: CorwinSchultzBar[]): void {
    if (!bars || bars.length < 2) {
      throw new Error('Corwin-Schultz estimator requires at least 2 consecutive price bars');
    }
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (b.high <= 0 || b.low <= 0) {
        throw new Error(`Bar at index ${i} has non-positive prices: high=${b.high}, low=${b.low}`);
      }
      if (b.high < b.low) {
        throw new Error(`Bar at index ${i} has invalid high/low: high=${b.high} < low=${b.low}`);
      }
    }
  }

  /**
   * Estimates bid-ask spread and volatility across consecutive two-day intervals.
   */
  public static estimate(
    bars: CorwinSchultzBar[],
    config: CorwinSchultzConfig = {}
  ): CorwinSchultzResult {
    this.validateBars(bars);
    const clampNegative = config.clampNegativeToZero ?? true;

    let sumAlpha = 0.0;
    let sumBeta = 0.0;
    let sumGamma = 0.0;
    let pairCount = 0;

    // Evaluate over non-overlapping or rolling 2-day pairs
    // Standard Corwin-Schultz implementation averages over consecutive rolling pairs (t, t+1)
    for (let i = 0; i < bars.length - 1; i++) {
      const bar1 = bars[i];
      const bar2 = bars[i + 1];

      const beta = CorwinSchultzMath.computeBeta(bar1, bar2);
      const gamma = CorwinSchultzMath.computeGamma(bar1, bar2);
      const alpha = CorwinSchultzMath.computeAlpha(beta, gamma);

      sumBeta += beta;
      sumGamma += gamma;
      sumAlpha += alpha;
      pairCount++;
    }

    if (pairCount === 0) {
      return {
        spread: 0,
        spreadBps: 0,
        volatility: 0,
        pairCount: 0,
        rawAlpha: 0,
        rawBeta: 0,
        rawGamma: 0,
      };
    }

    const avgAlpha = sumAlpha / pairCount;
    const avgBeta = sumBeta / pairCount;
    const avgGamma = sumGamma / pairCount;

    const spread = CorwinSchultzMath.computeSpreadFromAlpha(avgAlpha, clampNegative);
    const spreadBps = spread * 10000.0;
    const volatility = CorwinSchultzMath.computeRangeVolatility(avgBeta);

    return {
      spread: Number(spread.toFixed(6)),
      spreadBps: Number(spreadBps.toFixed(2)),
      volatility: Number(volatility.toFixed(6)),
      pairCount,
      rawAlpha: Number(avgAlpha.toFixed(6)),
      rawBeta: Number(avgBeta.toFixed(6)),
      rawGamma: Number(avgGamma.toFixed(6)),
    };
  }
}
