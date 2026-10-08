/**
 * Dynamic Collateral Waterfall Allocator
 * Optimizes collateral pledging order based on liquidity tiers, opportunity costs, and post-haircut values.
 *
 * @module desk/margin/collateral-waterfall-allocator
 */

import {
  CollateralHolding,
  CollateralAllocationResult,
} from './margin-types';

export class CollateralWaterfallAllocator {
  /**
   * Pledges available collateral holdings down a liquidity waterfall to cover required margin.
   * Priority: Lowest liquidity tier (Tier 4) pledged first if acceptable, preserving Tier 1 Cash.
   * Or if preserveCash is false, pledges highest liquidity first.
   */
  public allocateCollateral(
    requiredMarginUsd: number,
    holdings: CollateralHolding[],
    preserveCashLiquidity = true
  ): CollateralAllocationResult {
    if (requiredMarginUsd <= 0) {
      throw new Error('requiredMarginUsd must be strictly positive');
    }

    // Sort holdings: if preserveCashLiquidity, pledge Tier 4 down to Tier 1; otherwise Tier 1 up to Tier 4
    const sorted = [...holdings].sort((a, b) => {
      if (preserveCashLiquidity) {
        // Higher tier number (less liquid) pledged first
        return b.liquidityTier - a.liquidityTier || b.haircutPercentage - a.haircutPercentage;
      }
      return a.liquidityTier - b.liquidityTier || a.haircutPercentage - b.haircutPercentage;
    });

    let remainingRequirementPostHaircut = requiredMarginUsd;
    let totalPledgedPostHaircut = 0;
    const allocations = [];

    for (const h of sorted) {
      const postHaircutRate = Math.max(0, 1 - h.haircutPercentage);
      const totalPostHaircutValue = h.marketValueUsd * postHaircutRate;

      if (totalPostHaircutValue <= 0) {
        allocations.push({
          holdingId: h.holdingId,
          pledgedPreHaircutUsd: 0,
          pledgedPostHaircutUsd: 0,
          remainingAvailableUsd: h.marketValueUsd,
        });
        continue;
      }

      if (remainingRequirementPostHaircut <= 0) {
        allocations.push({
          holdingId: h.holdingId,
          pledgedPreHaircutUsd: 0,
          pledgedPostHaircutUsd: 0,
          remainingAvailableUsd: h.marketValueUsd,
        });
        continue;
      }

      const neededPostHaircut = Math.min(remainingRequirementPostHaircut, totalPostHaircutValue);
      const neededPreHaircut = neededPostHaircut / postHaircutRate;

      remainingRequirementPostHaircut -= neededPostHaircut;
      totalPledgedPostHaircut += neededPostHaircut;

      allocations.push({
        holdingId: h.holdingId,
        pledgedPreHaircutUsd: Number(neededPreHaircut.toFixed(2)),
        pledgedPostHaircutUsd: Number(neededPostHaircut.toFixed(2)),
        remainingAvailableUsd: Number((h.marketValueUsd - neededPreHaircut).toFixed(2)),
      });
    }

    const isFullyCollateralized = remainingRequirementPostHaircut <= 0.001;
    const excessCollateralUsd = Number(
      Math.max(0, totalPledgedPostHaircut - requiredMarginUsd).toFixed(2)
    );

    return {
      totalRequiredCollateralUsd: requiredMarginUsd,
      totalPledgedPostHaircutUsd: Number(totalPledgedPostHaircut.toFixed(2)),
      isFullyCollateralized,
      allocations,
      excessCollateralUsd,
    };
  }
}
