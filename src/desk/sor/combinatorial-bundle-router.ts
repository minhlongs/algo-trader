/**
 * Combinatorial Bundle Router Engine
 *
 * Coordinates execution of multi-leg conditional token bundles with atomic
 * leg-locking invariants to prevent unhedged directional legging risk.
 *
 * @module desk/sor/combinatorial-bundle-router
 */

import type {
  AvailableLegDepth,
  BundleFillResult,
  BundleLegSpec,
  LegExecutionDetail,
} from './combinatorial-bundle-types';

export class CombinatorialBundleRouter {
  private readonly maxSkewTolerance: number;

  public constructor(maxSkewTolerance: number = 0.05) {
    this.maxSkewTolerance = maxSkewTolerance;
  }

  public routeBundle(
    bundleId: string,
    legs: readonly BundleLegSpec[],
    marketDepths: readonly AvailableLegDepth[]
  ): BundleFillResult {
    if (legs.length === 0) {
      return {
        bundleId,
        isFullyFilled: false,
        executedLegs: [],
        aggregateCostUsd: 0,
        blendedBundlePrice: 0,
        maxSkewDiscrepancy: 0,
        rollbackRequired: false,
      };
    }

    const depthMap = new Map<string, AvailableLegDepth>();
    for (const d of marketDepths) {
      depthMap.set(d.marketId, d);
    }

    // 1. Pre-execution feasibility & atomic lock check
    let minFillableRatio = 1.0;
    for (const leg of legs) {
      const depth = depthMap.get(leg.marketId);
      if (!depth || depth.bestOfferPrice > leg.maxLimitPrice) {
        minFillableRatio = 0.0;
        break;
      }
      const ratio = Math.min(1.0, depth.availableQuantity / leg.targetQuantity);
      if (ratio < minFillableRatio) {
        minFillableRatio = ratio;
      }
    }

    // If any leg cannot be filled at all or below threshold, abort/rollback
    if (minFillableRatio <= 0.001) {
      return {
        bundleId,
        isFullyFilled: false,
        executedLegs: legs.map((l) => ({
          legId: l.legId,
          marketId: l.marketId,
          targetQuantity: l.targetQuantity,
          filledQuantity: 0,
          averagePrice: 0,
          fillRatio: 0,
        })),
        aggregateCostUsd: 0,
        blendedBundlePrice: 0,
        maxSkewDiscrepancy: 0,
        rollbackRequired: true,
      };
    }

    // 2. Synchronized Execution with proportional fill clamping
    const executedLegs: LegExecutionDetail[] = [];
    let aggregateCostUsd = 0;
    let minRatio = 1.0;
    let maxRatio = 0.0;

    for (const leg of legs) {
      const depth = depthMap.get(leg.marketId)!;
      // Proportional fill governed by minFillableRatio to ensure no leg skew
      const fillQty = Math.round(leg.targetQuantity * minFillableRatio);
      const legCost = fillQty * depth.bestOfferPrice;
      const fillRatio = leg.targetQuantity > 0 ? fillQty / leg.targetQuantity : 0;

      if (fillRatio < minRatio) minRatio = fillRatio;
      if (fillRatio > maxRatio) maxRatio = fillRatio;

      aggregateCostUsd += legCost;
      executedLegs.push({
        legId: leg.legId,
        marketId: leg.marketId,
        targetQuantity: leg.targetQuantity,
        filledQuantity: fillQty,
        averagePrice: depth.bestOfferPrice,
        fillRatio: Math.round(fillRatio * 1000) / 1000,
      });
    }

    const maxSkewDiscrepancy = Math.round((maxRatio - minRatio) * 1000) / 1000;
    const rollbackRequired = maxSkewDiscrepancy > this.maxSkewTolerance;
    const totalQty = executedLegs.reduce((sum, l) => sum + l.filledQuantity, 0);
    const blendedBundlePrice = totalQty > 0
      ? Math.round((aggregateCostUsd / totalQty) * 10_000) / 10_000
      : 0;

    return {
      bundleId,
      isFullyFilled: minFillableRatio >= 0.999 && !rollbackRequired,
      executedLegs,
      aggregateCostUsd: Math.round(aggregateCostUsd * 100) / 100,
      blendedBundlePrice,
      maxSkewDiscrepancy,
      rollbackRequired,
    };
  }
}
