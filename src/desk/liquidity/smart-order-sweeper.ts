/**
 * Multi-Venue Smart Order Sweeper
 * Impact-minimizing venue allocation solver across lit exchanges and dark pools.
 *
 * @module desk/liquidity/smart-order-sweeper
 */

import {
  VenueQuote,
  SweepOrderRequest,
  SweepResult,
  VenueAllocation,
} from './liquidity-types';

export class SmartOrderSweeper {
  /**
   * Sweeps across available venues prioritizing price improvement and low adverse impact.
   */
  public sweepOrder(request: SweepOrderRequest, venues: VenueQuote[]): SweepResult {
    const { orderId, side, totalQuantity, limitPrice, urgency } = request;

    if (totalQuantity <= 0) {
      throw new Error('Total quantity must be strictly positive');
    }
    if (venues.length === 0) {
      throw new Error('Venues list cannot be empty');
    }

    // Filter eligible venues by limit price
    const eligible = venues.filter((v) => {
      if (side === 'BUY') {
        return v.price <= limitPrice;
      }
      return v.price >= limitPrice;
    });

    // Score and rank venues: prioritize price improvement, then rebate, then low adverse drift
    const ranked = [...eligible].sort((a, b) => {
      const priceDiff = side === 'BUY' ? a.price - b.price : b.price - a.price;
      if (priceDiff !== 0) return priceDiff; // Lower ask for buy, higher bid for sell

      // If price equal, prefer dark pools / internal cross if low toxicity
      const driftDiff = a.historicalAdverseDriftBps - b.historicalAdverseDriftBps;
      if (Math.abs(driftDiff) > 0.5) return driftDiff;

      // Prefer rebate (lowest fee)
      return a.feeOrRebateUsdPerShare - b.feeOrRebateUsdPerShare;
    });

    let remainingQty = totalQuantity;
    const allocations: VenueAllocation[] = [];
    let weightedPriceSum = 0;
    let totalAllocated = 0;
    let expectedFillSum = 0;

    for (const v of ranked) {
      if (remainingQty <= 0) break;

      const fillFactor = urgency === 'AGGRESSIVE' ? 1.0 : v.historicalFillProbability;
      const allocQty = Math.min(remainingQty, v.availableSize);
      if (allocQty <= 0) continue;

      const expFill = allocQty * fillFactor;
      const fee = allocQty * v.feeOrRebateUsdPerShare;

      allocations.push({
        venueId: v.venueId,
        venueType: v.venueType,
        allocatedQuantity: allocQty,
        expectedFillQuantity: Number(expFill.toFixed(2)),
        expectedEffectivePrice: v.price,
        expectedFeeUsd: Number(fee.toFixed(2)),
      });

      weightedPriceSum += v.price * allocQty;
      totalAllocated += allocQty;
      expectedFillSum += expFill;
      remainingQty -= allocQty;
    }

    const wap = totalAllocated > 0 ? weightedPriceSum / totalAllocated : limitPrice;
    const fillRatePct = totalAllocated > 0 ? (expectedFillSum / totalAllocated) * 100 : 0;

    // Almgren-Chriss style linear temporary impact proxy (bps)
    const impactScale = urgency === 'AGGRESSIVE' ? 2.5 : 1.0;
    const estimatedImpactBps = Number((Math.sqrt(totalAllocated / 1000) * impactScale).toFixed(2));

    return {
      orderId,
      totalRequested: totalQuantity,
      totalAllocated,
      expectedFillRatePct: Number(fillRatePct.toFixed(2)),
      weightedAveragePrice: Number(wap.toFixed(4)),
      allocations,
      estimatedTotalImpactBps: estimatedImpactBps,
    };
  }
}
