/**
 * Wave 221: Cont & Kukanov (2017) Optimal Order Placement Across Venues Math.
 *
 * Implements multi-venue allocation optimization algorithm.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import type {
  SmartRoutingConfig,
  OptimalRoutingResult,
  VenueAllocation,
} from './cont-kukanov-types';

export class ContKukanovMath {
  public static optimizeOrderPlacement(config: SmartRoutingConfig): OptimalRoutingResult {
    const venues = config.venues;
    const totalShares = Math.max(1, config.totalOrderShares);
    const lambda = Math.max(0.01, config.adverseSelectionAversion);

    if (venues.length === 0) {
      return { totalOrderShares: totalShares, allocations: [], expectedTotalCostBps: 0, effectiveRebateBps: 0 };
    }

    // Compute effective venue net utility score:
    // score = fillProbability * (-makerFee - lambda * adverseSelection) / (1 + queueDepth / 1000)
    const scoredVenues = venues.map((v) => {
      const rebate = -v.makerFeeBps; // Positive if rebate
      const netMakerAdvantage = rebate - lambda * v.adverseSelectionPenaltyBps;
      const queuePenalty = 1.0 + Math.max(0, v.queueDepthAheadShares) / 5000.0;
      const utilityScore = (v.fillProbability * netMakerAdvantage) / queuePenalty;
      return { venue: v, score: Math.max(0.001, utilityScore) };
    });

    const sumScores = scoredVenues.reduce((acc, curr) => acc + curr.score, 0);

    let allocatedTotal = 0;
    const allocations: VenueAllocation[] = scoredVenues.map((item, idx) => {
      let allocated: number;
      if (idx === scoredVenues.length - 1) {
        allocated = Math.max(0, totalShares - allocatedTotal);
      } else {
        const weight = item.score / sumScores;
        allocated = Math.round(totalShares * weight);
        allocatedTotal += allocated;
      }

      const v = item.venue;
      const expectedFillRate = v.fillProbability;
      const netCostBps = v.makerFeeBps + (1.0 - expectedFillRate) * v.takerFeeBps + lambda * v.adverseSelectionPenaltyBps;

      return {
        venueId: v.venueId,
        allocatedShares: allocated,
        expectedFillRate: Number(expectedFillRate.toFixed(4)),
        expectedCostBps: Number(netCostBps.toFixed(4)),
      };
    });

    const weightedCost = allocations.reduce((acc, a) => acc + a.allocatedShares * a.expectedCostBps, 0) / totalShares;
    const weightedRebate = allocations.reduce((acc, a) => {
      const orig = venues.find((v) => v.venueId === a.venueId);
      const reb = (orig && orig.makerFeeBps < 0) ? -orig.makerFeeBps : 0;
      return acc + a.allocatedShares * reb;
    }, 0) / totalShares;

    return {
      totalOrderShares: totalShares,
      allocations,
      expectedTotalCostBps: Number(weightedCost.toFixed(4)),
      effectiveRebateBps: Number(weightedRebate.toFixed(4)),
    };
  }
}
