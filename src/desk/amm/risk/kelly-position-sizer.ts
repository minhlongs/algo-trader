/**
 * Kelly Position Sizer
 * Quarter-Kelly sizing f* = (p(b+1) - 1) / (4b) bounded by 5% equity cap
 * (Milestone 4 / Feature 12)
 */

import { KellySizingParams } from '../types/risk-types';

export class KellyPositionSizer {
  public static calculateQuarterKelly(params: KellySizingParams): {
    fullKellyFraction: number;
    quarterKellyFraction: number;
    cappedFraction: number;
    recommendedSizeUsd: number;
  } {
    const { winProbability: p, netOdds: b, portfolioCapital, maxQuarterFraction = 0.05 } = params;

    if (b <= 0 || p <= 0 || p >= 1.0) {
      return {
        fullKellyFraction: 0,
        quarterKellyFraction: 0,
        cappedFraction: 0,
        recommendedSizeUsd: 0,
      };
    }

    // Standard Kelly criterion: f = (b*p - (1 - p)) / b = (p*(b+1) - 1) / b
    const rawKelly = (p * (b + 1) - 1) / b;
    const fullKellyFraction = Math.max(0, rawKelly);
    const quarterKellyFraction = fullKellyFraction / 4;
    const cappedFraction = Math.min(maxQuarterFraction, quarterKellyFraction);
    const recommendedSizeUsd = Number((portfolioCapital * cappedFraction).toFixed(2));

    return {
      fullKellyFraction: Number(fullKellyFraction.toFixed(6)),
      quarterKellyFraction: Number(quarterKellyFraction.toFixed(6)),
      cappedFraction: Number(cappedFraction.toFixed(6)),
      recommendedSizeUsd,
    };
  }
}
