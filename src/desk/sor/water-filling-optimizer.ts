import {
  RoutingRequest,
  RoutingPlan,
  VenueBook,
  OrderSlice,
  VenueId,
} from './sor-types';
import { FeeGasModel } from './fee-gas-model';

interface LiquidityTier {
  venueId: VenueId;
  price: number;
  available: number;
  takerFeeBps: number;
  gasCostUsd: number;
  effectivePrice: number;
}

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
    const isBuy = request.side === 'BUY';
    const tiers: LiquidityTier[] = [];

    for (const book of books) {
      if (excludedVenues.has(book.venueId)) continue;
      const ladder = isBuy ? book.asks : book.bids;
      for (const [p, q] of ladder) {
        if (q <= 0) continue;
        const feeMultiplier = isBuy ? 1 + book.takerFeeBps / 10000 : 1 - book.takerFeeBps / 10000;
        tiers.push({
          venueId: book.venueId,
          price: p,
          available: q,
          takerFeeBps: book.takerFeeBps,
          gasCostUsd: book.gasCostUsd ?? 0,
          effectivePrice: p * feeMultiplier,
        });
      }
    }
    tiers.sort((a, b) => isBuy ? a.effectivePrice - b.effectivePrice : b.effectivePrice - a.effectivePrice);

    let remaining = request.targetQuantity;
    let totalGrossUsd = 0;
    let totalFeeUsd = 0;
    let totalGasUsd = 0;
    const allocMap = new Map<VenueId, { qty: number; gross: number; fee: number; limitPrice: number }>();
    const gasCharged = new Set<VenueId>();

    for (const tier of tiers) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, tier.available);
      remaining -= fillQty;
      const fillGross = fillQty * tier.price;
      const fillFee = fillGross * (tier.takerFeeBps / 10000);

      const cur = allocMap.get(tier.venueId) ?? { qty: 0, gross: 0, fee: 0, limitPrice: tier.price };
      cur.qty += fillQty;
      cur.gross += fillGross;
      cur.fee += fillFee;
      cur.limitPrice = isBuy ? Math.max(cur.limitPrice, tier.price) : Math.min(cur.limitPrice, tier.price);
      allocMap.set(tier.venueId, cur);

      totalGrossUsd += fillGross;
      totalFeeUsd += fillFee;
      if (!gasCharged.has(tier.venueId)) {
        totalGasUsd += tier.gasCostUsd;
        gasCharged.add(tier.venueId);
      }
    }

    const allocations: OrderSlice[] = Array.from(allocMap.entries()).map(([venueId, cur]) => {
      const gas = gasCharged.has(venueId) ? (books.find(b => b.venueId === venueId)?.gasCostUsd ?? 0) : 0;
      return {
        venueId,
        quantity: cur.qty,
        limitPrice: cur.limitPrice,
        feeUsd: cur.fee,
        gasCostUsd: gas,
        effectivePrice: cur.qty > 0 ? cur.gross / cur.qty : 0,
        netProceedsOrCost: isBuy ? cur.gross + cur.fee + gas : cur.gross - cur.fee - gas,
      };
    });

    const filledQty = request.targetQuantity - remaining;
    const avgPrice = filledQty > 0 ? totalGrossUsd / filledQty : 0;
    const netProceedsUsd = isBuy ? totalGrossUsd + totalFeeUsd + totalGasUsd : totalGrossUsd - totalFeeUsd - totalGasUsd;

    return {
      routeId: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: request.symbol,
      side: request.side,
      totalQuantity: filledQty,
      allocations,
      expectedEffectivePrice: avgPrice,
      expectedTotalFeeUsd: totalFeeUsd,
      expectedGasCostUsd: totalGasUsd,
      expectedNetProceedsUsd: netProceedsUsd,
      priceImprovementBps: 0,
      timestamp: Date.now(),
    };
  }

  private findBestNaiveExecution(
    request: RoutingRequest,
    books: readonly VenueBook[]
  ): { venueId: VenueId; netProceedsUsd: number; plan: RoutingPlan } | null {
    const isBuy = request.side === 'BUY';
    let best: { venueId: VenueId; netProceedsUsd: number; plan: RoutingPlan } | null = null;
    for (const book of books) {
      const plan = this.runWaterFilling(request, [book], new Set());
      if (plan.totalQuantity >= request.targetQuantity * 0.999) {
        const net = plan.expectedNetProceedsUsd;
        if (!best || (isBuy ? net < best.netProceedsUsd : net > best.netProceedsUsd)) {
          best = { venueId: book.venueId, netProceedsUsd: net, plan };
        }
      }
    }
    return best;
  }
}
