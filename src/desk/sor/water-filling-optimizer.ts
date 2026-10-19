import {
  RoutingRequest,
  RoutingPlan,
  VenueBook,
  VenueId,
} from './sor-types';
import { FeeGasModel } from './fee-gas-model';
import {
  type LiquidityTier,
  runWaterFillingPass,
  findBestNaiveExecution,
} from './water-filling-math';

export {
  type LiquidityTier,
  runWaterFillingPass,
  findBestNaiveExecution,
};

export class WaterFillingOptimizer {
  private readonly feeGasModel: FeeGasModel;

  constructor(feeGasModel?: FeeGasModel) {
    this.feeGasModel = feeGasModel ?? new FeeGasModel();
  }

  public optimizeRoute(request: RoutingRequest, books: readonly VenueBook[]): RoutingPlan {
    const isBuy = request.side === 'BUY';
    const excludedVenues = new Set<VenueId>();
    let plan = this.runWaterFilling(request, books, excludedVenues);

    // Prune on-chain venues whose price improvement fails the gas hurdle
    for (const alloc of plan.allocations) {
      if (alloc.gasCostUsd > 0) {
        const without = this.runWaterFilling(request, books, new Set([...excludedVenues, alloc.venueId]));
        if (without.totalQuantity >= plan.totalQuantity * 0.999 && without.allocations.length > 0) {
          const costDiff = isBuy
            ? without.expectedNetProceedsUsd - plan.expectedNetProceedsUsd
            : plan.expectedNetProceedsUsd - without.expectedNetProceedsUsd;
          if (costDiff < 0) {
            excludedVenues.add(alloc.venueId);
            plan = this.runWaterFilling(request, books, excludedVenues);
          }
        }
      }
    }

    const naive = this.findBestNaiveExecution(request, books);
    if (naive) {
      const isSorBetter = isBuy
        ? plan.expectedNetProceedsUsd <= naive.netProceedsUsd + 1e-6
        : plan.expectedNetProceedsUsd >= naive.netProceedsUsd - 1e-6;

      if (!isSorBetter && naive.plan.allocations.length > 0) {
        return {
          ...naive.plan,
          routeId: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          priceImprovementBps: 0,
          naiveBestVenue: naive.venueId,
          naiveTotalCostUsd: naive.netProceedsUsd,
        };
      }

      const savings = isBuy
        ? Math.max(0, naive.netProceedsUsd - plan.expectedNetProceedsUsd)
        : Math.max(0, plan.expectedNetProceedsUsd - naive.netProceedsUsd);
      const improvementBps = naive.netProceedsUsd > 0 ? (savings / naive.netProceedsUsd) * 10000 : 0;
      return {
        ...plan,
        priceImprovementBps: Number(improvementBps.toFixed(2)),
        naiveBestVenue: naive.venueId,
        naiveTotalCostUsd: naive.netProceedsUsd,
      };
    }
    return plan;
  }

  private runWaterFilling(
    request: RoutingRequest,
    books: readonly VenueBook[],
    excludedVenues: Set<VenueId>
  ): RoutingPlan {
    return runWaterFillingPass(request, books, excludedVenues);
  }

  private findBestNaiveExecution(
    request: RoutingRequest,
    books: readonly VenueBook[]
  ): { venueId: VenueId; netProceedsUsd: number; plan: RoutingPlan } | null {
    return findBestNaiveExecution(request, books);
  }
}
