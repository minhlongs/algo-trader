/**
 * Rogers-Satchell (1991) Volatility Engine
 */

import {
  RogersSatchellBar,
  RogersSatchellConfig,
  RogersSatchellEstimates,
} from './rogerssatchell-types.js';
import { RogersSatchellMath } from './rogerssatchell-math.js';

export class RogersSatchellEngine {
  public static validateBars(bars: RogersSatchellBar[], minBars: number = 2): void {
    if (!bars || bars.length < minBars) {
      throw new Error(`At least ${minBars} OHLC bars are required`);
    }

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) {
        throw new Error(`Bar ${i} has non-positive prices`);
      }
      if (b.high < b.low) {
        throw new Error(`Bar ${i} high is less than low`);
      }
      if (b.high < b.open || b.high < b.close) {
        throw new Error(`Bar ${i} high must be >= open and close`);
      }
      if (b.low > b.open || b.low > b.close) {
        throw new Error(`Bar ${i} low must be <= open and close`);
      }
    }
  }

  public static estimate(
    bars: RogersSatchellBar[],
    config: RogersSatchellConfig = {}
  ): RogersSatchellEstimates {
    const annualizationFactor = config.annualizationFactor ?? 252;
    this.validateBars(bars, config.minBars ?? 2);

    const rsVar = RogersSatchellMath.computeRSVariance(bars);
    const ccVar = RogersSatchellMath.computeCloseToCloseVariance(bars);

    return {
      rogersSatchellVol: Math.sqrt(Math.max(0, rsVar) * annualizationFactor),
      classicalCloseToCloseVol: Math.sqrt(Math.max(0, ccVar) * annualizationFactor),
      efficiencyRatio: 6.0, // Classical theoretical efficiency under Brownian motion with drift
      sampleSize: bars.length,
      annualizationFactor,
    };
  }
}
