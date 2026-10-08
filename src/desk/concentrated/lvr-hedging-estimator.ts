/**
 * Loss-Versus-Rebalancing (LVR) & Delta Hedging Estimator
 * Models continuous adverse selection decay and computes optimal external market hedge.
 * Based on Milionis, Moallemi, Roughgarden, and Zhang (2022).
 *
 * @module desk/concentrated/lvr-hedging-estimator
 */

import { LvrHedgeParameters, LvrMetrics } from './concentrated-types';

export class LvrHedgingEstimator {
  /**
   * Computes continuous LVR rate and optimal hedge ratio for a concentrated liquidity LP position.
   * Instantaneous LVR = (sigma^2 / 8) * poolValueUsd (annualized), converted to daily rate.
   */
  public computeLvrMetrics(params: LvrHedgeParameters, dailyVolumeUsd: number): LvrMetrics {
    const { poolLiquidity, currentPrice, assetVolatilitySigma, poolValueUsd, feeRateBps } = params;

    if (currentPrice <= 0 || assetVolatilitySigma <= 0 || poolValueUsd <= 0) {
      throw new Error('currentPrice, assetVolatilitySigma, and poolValueUsd must be strictly positive');
    }

    // Annualized LVR = (sigma^2 / 8) * poolValueUsd
    const annualizedLvrUsd = ((assetVolatilitySigma * assetVolatilitySigma) / 8) * poolValueUsd;
    const instantaneousLvrRateUsdPerDay = annualizedLvrUsd / 365;

    // Optimal LP inventory delta: Delta = L / (2 * sqrt(P))
    const optimalHedgeDelta = poolLiquidity / (2 * Math.sqrt(currentPrice));

    // Fee revenue per day = dailyVolumeUsd * (feeRateBps / 10,000)
    const feeRateFraction = feeRateBps / 10_000;
    const expectedDailyFeesUsd = dailyVolumeUsd * feeRateFraction;

    // Break-even daily volume: Volume * feeRate = LVR_per_day
    const breakEvenDailyVolumeUsd = feeRateFraction > 0
      ? instantaneousLvrRateUsdPerDay / feeRateFraction
      : Number.POSITIVE_INFINITY;

    const isLpNetPositive = expectedDailyFeesUsd >= instantaneousLvrRateUsdPerDay;

    // Adverse selection bps relative to pool value
    const adverseSelectionBps = (instantaneousLvrRateUsdPerDay / poolValueUsd) * 10_000;

    return {
      instantaneousLvrRateUsdPerDay,
      optimalHedgeDelta,
      breakEvenDailyVolumeUsd,
      isLpNetPositive,
      adverseSelectionBps,
    };
  }

  /**
   * Rebalancing delta adjustments required when price moves from P0 to P1.
   */
  public calculateRebalancingDeltaChange(
    poolLiquidity: number,
    oldPrice: number,
    newPrice: number
  ): number {
    if (oldPrice <= 0 || newPrice <= 0) {
      throw new Error('Prices must be strictly positive');
    }
    const deltaOld = poolLiquidity / (2 * Math.sqrt(oldPrice));
    const deltaNew = poolLiquidity / (2 * Math.sqrt(newPrice));
    // Quantity to buy/sell to rebalance hedge
    return deltaNew - deltaOld;
  }
}
