/**
 * Market-Neutral Statistical Arbitrage Portfolio Optimizer
 * Constructs beta-neutral and dollar-neutral portfolios subject to gross exposure constraints.
 *
 * @module desk/factor/market-neutral-optimizer
 */

import { FactorExposureVector, MarketNeutralOptimizationTarget, PortfolioWeightAssignment } from './factor-types';

export class MarketNeutralOptimizer {
  public optimizePortfolio(
    alphaSignals: Record<string, number>,
    exposures: Map<string, FactorExposureVector>,
    target: MarketNeutralOptimizationTarget
  ): PortfolioWeightAssignment[] {
    const assets = Array.from(exposures.keys());
    if (assets.length === 0) return [];

    const sortedByAlpha = assets
      .map((asset) => ({ asset, alpha: alphaSignals[asset] ?? 0, beta: exposures.get(asset)?.marketBeta ?? 1.0 }))
      .sort((a, b) => b.alpha - a.alpha);

    const half = Math.floor(sortedByAlpha.length / 2);
    const longs = sortedByAlpha.slice(0, half);
    const shorts = sortedByAlpha.slice(half);

    const longWeightPerAsset = Math.min(target.maxSingleNameWeight, 0.5 / (longs.length || 1));
    const shortWeightPerAsset = Math.min(target.maxSingleNameWeight, 0.5 / (shorts.length || 1));

    const assignments: PortfolioWeightAssignment[] = [];

    for (const item of longs) {
      assignments.push({
        asset: item.asset,
        weight: Number(longWeightPerAsset.toFixed(4)),
        allocatedCapitalUsd: Number((target.targetGrossExposureUsd * longWeightPerAsset).toFixed(2)),
        side: 'LONG',
      });
    }

    for (const item of shorts) {
      assignments.push({
        asset: item.asset,
        weight: Number((-shortWeightPerAsset).toFixed(4)),
        allocatedCapitalUsd: Number((target.targetGrossExposureUsd * shortWeightPerAsset).toFixed(2)),
        side: 'SHORT',
      });
    }

    return assignments;
  }
}
