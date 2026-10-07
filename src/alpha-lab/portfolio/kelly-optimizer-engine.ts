/**
 * Prediction Market Fractional Kelly Portfolio Optimizer
 *
 * Computes optimal bet sizing across binary event contracts under
 * fractional Kelly scaling and risk constraints.
 *
 * @module alpha-lab/portfolio/kelly-optimizer-engine
 */

import type {
  KellyAllocationResult,
  PortfolioKellySummary,
  PredictionBetCandidate,
} from './kelly-optimizer-types';

export class KellyOptimizerEngine {
  private readonly fractionalMultiplier: number; // e.g. 0.5 for Half-Kelly
  private readonly maxSingleBetCap: number; // e.g. 0.15 for 15% NAV
  private readonly maxTotalLeverage: number; // e.g. 0.80 for 80% NAV

  constructor(options?: {
    fractionalMultiplier?: number;
    maxSingleBetCap?: number;
    maxTotalLeverage?: number;
  }) {
    this.fractionalMultiplier = options?.fractionalMultiplier ?? 0.5;
    this.maxSingleBetCap = options?.maxSingleBetCap ?? 0.20;
    this.maxTotalLeverage = options?.maxTotalLeverage ?? 0.90;
  }

  public optimize(
    candidates: readonly PredictionBetCandidate[],
    portfolioNav: number
  ): PortfolioKellySummary {
    const allocations: KellyAllocationResult[] = [];
    let cumulativeFraction = 0;

    for (const c of candidates) {
      const p = Math.max(0, Math.min(1, c.estimatedProbability));
      const q = 1 - p;
      const price = c.marketPrice;

      if (price <= 0 || price >= 1) {
        continue;
      }

      // Net odds: b = (1 - price) / price
      const b = (1 - price) / price;
      // Kelly fraction f* = (b*p - q) / b
      const edge = p - price;
      const fullKelly = edge > 0 ? (b * p - q) / b : 0;

      if (fullKelly <= 0) {
        continue;
      }

      const scaledKelly = fullKelly * this.fractionalMultiplier;
      const cap = Math.min(this.maxSingleBetCap, c.maxFractionCap ?? this.maxSingleBetCap);
      const allocatedFraction = Math.min(scaledKelly, cap);

      // Expected log growth rate g = p * ln(1 + b*f) + q * ln(1 - f)
      const growthRate =
        p * Math.log(1 + b * allocatedFraction) + q * Math.log(Math.max(0.0001, 1 - allocatedFraction));

      allocations.push({
        assetId: c.assetId,
        edge,
        fullKellyFraction: fullKelly,
        allocatedFraction,
        allocatedAmountUsd: allocatedFraction * portfolioNav,
        expectedGrowthRate: growthRate,
      });

      cumulativeFraction += allocatedFraction;
    }

    // Rescale if total exceeds max leverage
    if (cumulativeFraction > this.maxTotalLeverage && cumulativeFraction > 0) {
      const scale = this.maxTotalLeverage / cumulativeFraction;
      for (const alloc of allocations) {
        alloc.allocatedFraction *= scale;
        alloc.allocatedAmountUsd = alloc.allocatedFraction * portfolioNav;
      }
      cumulativeFraction = this.maxTotalLeverage;
    }

    const totalAllocatedUsd = cumulativeFraction * portfolioNav;
    const unallocatedCashUsd = Math.max(0, portfolioNav - totalAllocatedUsd);

    return {
      portfolioNav,
      fractionalMultiplier: this.fractionalMultiplier,
      totalAllocatedFraction: cumulativeFraction,
      totalAllocatedUsd,
      unallocatedCashUsd,
      allocations,
    };
  }
}
