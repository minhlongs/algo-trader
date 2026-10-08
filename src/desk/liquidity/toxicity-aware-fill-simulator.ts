/**
 * Toxicity-Aware Fill Simulator & Adverse Selection Tracker
 * Evaluates post-trade markouts, alpha drift, and adverse venue selection.
 *
 * @module desk/liquidity/toxicity-aware-fill-simulator
 */

import {
  VenueAllocation,
  VenueQuote,
  SimulatedFillEvent,
} from './liquidity-types';

export class ToxicityAwareFillSimulator {
  /**
   * Simulates post-trade executions and calculates adverse selection metrics.
   */
  public simulateExecutions(
    allocations: VenueAllocation[],
    venuesMap: Map<string, VenueQuote>,
    postTradePriceMoveBps: number
  ): SimulatedFillEvent[] {
    const results: SimulatedFillEvent[] = [];

    for (const alloc of allocations) {
      const venue = venuesMap.get(alloc.venueId);
      const fillProb = venue ? venue.historicalFillProbability : 0.8;
      const adverseDrift = venue ? venue.historicalAdverseDriftBps : 1.0;

      // Deterministic fill size based on historical probability
      const executedQty = Math.round(alloc.allocatedQuantity * fillProb);

      // Adverse selection if post-trade move exceeds venue adverse drift tolerance
      const wasAdverselySelected = Math.abs(postTradePriceMoveBps) > adverseDrift;

      results.push({
        venueId: alloc.venueId,
        requestedQty: alloc.allocatedQuantity,
        executedQty,
        executionPrice: alloc.expectedEffectivePrice,
        wasAdverselySelected,
        postTradeAlphaDriftBps: postTradePriceMoveBps,
      });
    }

    return results;
  }
}
