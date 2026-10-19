/**
 * Parkinson (1980) High-Low Extreme Value Volatility Estimator Engine
 */

import {
  ParkinsonBar,
  ParkinsonConfig,
  ParkinsonEstimates,
} from './parkinson-types.js';
import { ParkinsonMath } from './parkinson-math.js';

export class ParkinsonEngine {
  public static validateBars(bars: ParkinsonBar[], minBars: number = 2): void {
    if (!bars || bars.length < minBars) {
      throw new Error(`Parkinson estimator requires at least ${minBars} bars, received ${bars?.length ?? 0}`);
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

  public static estimate(
    bars: ParkinsonBar[],
    config: ParkinsonConfig = {}
  ): ParkinsonEstimates {
    const minBars = config.minBars ?? 2;
    this.validateBars(bars, minBars);

    const annualizationFactor = config.annualizationFactor ?? 252;
    const parkinsonVariance = ParkinsonMath.computeParkinsonVariance(bars);
    const parkinsonVol = Math.sqrt(parkinsonVariance * annualizationFactor);

    return {
      parkinsonVol: Number(parkinsonVol.toFixed(6)),
      parkinsonVariance: Number(parkinsonVariance.toFixed(8)),
      efficiencyGain: 5.2, // Classical Parkinson 5.2x theoretical gain over close-to-close
      sampleSize: bars.length,
      annualizationFactor,
    };
  }
}
