/**
 * Dark Venue Router & Anti-Gaming Guard
 * Prioritizes midpoint crosses and ATS liquidity while preventing information leakage.
 *
 * @module desk/liquidity/dark-venue-router
 */

import {
  VenueQuote,
  VenueAllocation,
} from './liquidity-types';

export class DarkVenueRouter {
  /**
   * Routes block orders to dark venues with minimum execution size (MES) checks.
   */
  public routeToDarkVenues(
    totalQty: number,
    darkVenues: VenueQuote[],
    minExecutionSize = 100
  ): VenueAllocation[] {
    const validVenues = darkVenues.filter(
      (v) => (v.venueType === 'DARK_POOL_ATS' || v.venueType === 'INTERNAL_CROSS') &&
        v.availableSize >= minExecutionSize
    );

    let remaining = totalQty;
    const allocations: VenueAllocation[] = [];

    // Sort by fill probability descending, then adverse drift ascending
    validVenues.sort((a, b) => b.historicalFillProbability - a.historicalFillProbability || a.historicalAdverseDriftBps - b.historicalAdverseDriftBps);

    for (const v of validVenues) {
      if (remaining <= 0) break;

      const qty = Math.min(remaining, v.availableSize);
      if (qty < minExecutionSize) continue;

      allocations.push({
        venueId: v.venueId,
        venueType: v.venueType,
        allocatedQuantity: qty,
        expectedFillQuantity: Number((qty * v.historicalFillProbability).toFixed(2)),
        expectedEffectivePrice: v.price,
        expectedFeeUsd: Number((qty * v.feeOrRebateUsdPerShare).toFixed(2)),
      });

      remaining -= qty;
    }

    return allocations;
  }
}
