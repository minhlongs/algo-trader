/**
 * Prediction Market Smart Order Router (SOR) Engine
 *
 * Implements greedy water-filling liquidity aggregation across prediction venues
 * (Polymarket, Kalshi, Limitless) net of taker fees, with auto-slicing logic.
 *
 * @module desk/execution/pm-sor-engine
 */

import { randomUUID } from 'crypto';
import type {
  VenueBookSnapshot,
  RouteAllocation,
  SmartRoutePlan,
  SorRouterConfig,
  OrderAction,
  OutcomeSide,
} from './pm-sor-types';

interface CandidateLevel {
  venue: VenueBookSnapshot['venue'];
  marketId: string;
  price: number;
  quantity: number;
  feeRate: number;
  effectivePrice: number;
}

export class PmSmartOrderRouter {
  private readonly sliceThresholdRatio: number;
  private readonly maxSlices: number;
  private readonly maxSlippageBps: number;

  constructor(config?: SorRouterConfig) {
    this.sliceThresholdRatio = config?.sliceThresholdRatio ?? 0.5;
    this.maxSlices = config?.maxSlices ?? 5;
    this.maxSlippageBps = config?.maxSlippageBps ?? 200;
  }

  public optimizeRoute(params: {
    outcome: OutcomeSide;
    action: OrderAction;
    targetQuantity: number;
    books: readonly VenueBookSnapshot[];
  }): SmartRoutePlan {
    const { outcome, action, targetQuantity, books } = params;
    const candidates = this.collectCandidates(books, action);

    let remainingQty = Math.max(0, targetQuantity);
    const allocations: RouteAllocation[] = [];
    let totalCostUsd = 0;
    let filledQty = 0;
    let topBookLiquidity = 0;

    for (const cand of candidates) {
      if (remainingQty <= 0) break;
      if (allocations.length === 0) {
        topBookLiquidity = cand.quantity;
      }

      const takeQty = Math.min(remainingQty, cand.quantity);
      if (takeQty <= 0) continue;

      const cost = takeQty * cand.effectivePrice;
      allocations.push({
        venue: cand.venue,
        marketId: cand.marketId,
        allocatedQuantity: takeQty,
        marginalPrice: cand.price,
        feeRate: cand.feeRate,
        effectivePrice: cand.effectivePrice,
        costOrProceedsUsd: cost,
      });

      remainingQty -= takeQty;
      filledQty += takeQty;
      totalCostUsd += cost;
    }

    const avgPrice = filledQty > 0 ? totalCostUsd / filledQty : 0;
    const shouldSlice =
      topBookLiquidity > 0 && targetQuantity > topBookLiquidity * this.sliceThresholdRatio;
    const recommendedSlices = shouldSlice
      ? Math.min(this.maxSlices, Math.ceil(targetQuantity / Math.max(1, topBookLiquidity * 0.4)))
      : 1;

    return {
      routeId: `route-${randomUUID()}`,
      outcome,
      action,
      requestedQuantity: targetQuantity,
      filledQuantity: filledQty,
      averageEffectivePrice: avgPrice,
      totalNetCostUsd: totalCostUsd,
      allocations,
      shouldSlice,
      recommendedSlices,
    };
  }

  private collectCandidates(
    books: readonly VenueBookSnapshot[],
    action: OrderAction
  ): CandidateLevel[] {
    const candidates: CandidateLevel[] = [];

    for (const b of books) {
      const levels = action === 'BUY' ? b.asks : b.bids;
      for (const lvl of levels) {
        if (lvl.quantity <= 0 || lvl.price <= 0 || lvl.price >= 1) continue;
        // BUY: pay price + feeRate * price
        // SELL: receive price - feeRate * price
        const effPrice =
          action === 'BUY' ? lvl.price * (1 + b.feeRate) : lvl.price * (1 - b.feeRate);

        candidates.push({
          venue: b.venue,
          marketId: b.marketId,
          price: lvl.price,
          quantity: lvl.quantity,
          feeRate: b.feeRate,
          effectivePrice: effPrice,
        });
      }
    }

    // BUY wants lowest effective price; SELL wants highest effective price
    return candidates.sort((a, b) =>
      action === 'BUY' ? a.effectivePrice - b.effectivePrice : b.effectivePrice - a.effectivePrice
    );
  }
}
