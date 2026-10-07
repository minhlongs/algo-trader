/**
 * LP LVR & Yield Sentinel Engine
 *
 * Implements Milionis et al. Loss-Versus-Rebalancing (LVR) estimation
 * and computes dynamic delta hedge requirements for AMM liquidity positions.
 *
 * @module desk/amm/lp-lvr-yield-sentinel
 */

import type {
  AmmPoolState,
  LpLvrMetrics,
  LpPositionSnapshot,
} from './lp-lvr-yield-types';

export class LpLvrYieldSentinel {
  public estimateLvr(pool: AmmPoolState): number {
    const sigma = pool.rollingAnnualizedVol;
    // Theoretical LVR for constant product / concentrated AMM: (sigma^2 / 8)
    const annualizedLvr = (sigma * sigma) / 8;
    return annualizedLvr;
  }

  public calculateFeeApr(pool: AmmPoolState): number {
    if (pool.poolTvlUsd <= 0) return 0;
    const dailyFeesUsd = pool.dailyVolumeUsd * (pool.feeTierBps / 10_000);
    const annualFeesUsd = dailyFeesUsd * 365;
    return annualFeesUsd / pool.poolTvlUsd;
  }

  public computePositionDelta(
    position: LpPositionSnapshot,
    currentPrice: number
  ): number {
    if (currentPrice <= position.lowerTickPrice) {
      // 100% in base asset
      return position.positionValueUsd / Math.max(0.001, currentPrice);
    }
    if (currentPrice >= position.upperTickPrice) {
      // 100% in quote asset
      return 0;
    }

    // Concentrated liquidity delta interpolation
    const range = position.upperTickPrice - position.lowerTickPrice;
    if (range <= 0) return 0;

    const fractionInRange = (position.upperTickPrice - currentPrice) / range;
    const deltaUnits = (position.positionValueUsd / currentPrice) * fractionInRange;
    return deltaUnits;
  }

  public evaluatePoolYield(
    pool: AmmPoolState,
    position?: LpPositionSnapshot
  ): LpLvrMetrics {
    const annualizedLvr = this.estimateLvr(pool);
    const feeApr = this.calculateFeeApr(pool);
    const netYield = feeApr - annualizedLvr;

    const dailyLvrFraction = annualizedLvr / 365;
    const positionValue = position ? position.positionValueUsd : pool.poolTvlUsd;
    const dailyLvrDragUsd = positionValue * dailyLvrFraction;

    let deltaHedgeUnits = 0;
    if (position) {
      const positionDelta = this.computePositionDelta(position, pool.assetPrice);
      // Delta hedge requires shorting the perpetual equivalent to be delta-neutral
      deltaHedgeUnits = -positionDelta;
    }

    return {
      poolAddress: pool.poolAddress,
      annualizedLvrPct: Math.round(annualizedLvr * 10_000) / 100,
      feeAprPct: Math.round(feeApr * 10_000) / 100,
      netLpYieldPct: Math.round(netYield * 10_000) / 100,
      isYieldProfitable: netYield > 0,
      recommendedDeltaHedgeUnits: Math.round(deltaHedgeUnits * 1000) / 1000,
      estimatedDailyLvrDragUsd: Math.round(dailyLvrDragUsd * 100) / 100,
    };
  }
}
