/**
 * Garman-Klass (1980) & Parkinson (1980) Range Volatility Engine
 */

import {
  OHLCBar,
  RangeVolatilityEstimates,
  RangeVolatilityConfig,
} from './garmanklass-types.js';
import { GarmanKlassMath } from './garmanklass-math.js';

export class GarmanKlassEngine {
  public static validateBars(bars: OHLCBar[], minBars: number = 2): void {
    if (!bars || bars.length < minBars) {
      throw new Error(`At least ${minBars} OHLC bars required for volatility estimation`);
    }
    for (const b of bars) {
      if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) {
        throw new Error('All OHLC prices must be strictly positive');
      }
      if (b.high < b.low) {
        throw new Error(`High price (${b.high}) cannot be lower than Low price (${b.low})`);
      }
      if (b.high < b.open || b.high < b.close) {
        throw new Error('High price must be greater than or equal to Open and Close prices');
      }
      if (b.low > b.open || b.low > b.close) {
        throw new Error('Low price must be less than or equal to Open and Close prices');
      }
    }
  }

  public static estimate(
    bars: OHLCBar[],
    config: RangeVolatilityConfig = {}
  ): RangeVolatilityEstimates {
    const annualizationFactor = config.annualizationFactor ?? 252;
    const minBars = config.minBars ?? 2;
    this.validateBars(bars, minBars);

    const parkinsonVar = GarmanKlassMath.computeParkinsonVariance(bars);
    const garmanKlassVar = GarmanKlassMath.computeGarmanKlassVariance(bars);
    const ccVar = GarmanKlassMath.computeCloseToCloseVariance(bars);

    const parkinsonVol = Math.sqrt(Math.max(0, parkinsonVar) * annualizationFactor);
    const garmanKlassVol = Math.sqrt(Math.max(0, garmanKlassVar) * annualizationFactor);
    const classicalCloseToCloseVol = Math.sqrt(Math.max(0, ccVar) * annualizationFactor);

    // Parkinson has ~5.2x theoretical variance reduction over close-to-close; Garman-Klass has ~7.4x
    const parkinsonEfficiencyRatio = 5.2;
    const garmanKlassEfficiencyRatio = 7.4;

    return {
      parkinsonVol,
      garmanKlassVol,
      classicalCloseToCloseVol,
      parkinsonEfficiencyRatio,
      garmanKlassEfficiencyRatio,
      sampleSize: bars.length,
      annualizationFactor,
    };
  }
}
