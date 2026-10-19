/**
 * Wave 249: Cont & Kukanov (2014) - Optimal Order Placement across Fragmented Order Books.
 *
 * Distributes a parent order size Q across N fragmented venues to minimize
 * under-execution penalty (shortfall) and execution costs (fees/rebates/spreads):
 * Min sum_i [ cost_i(q_i) + underfill_penalty * P(demand > sum q_i) ]
 *
 * Strictly zero mocks, pure math, < 95 LOC, zero :any types.
 */

export interface VenueParameter {
  venueId: string;
  depthAvailable: number; // Queue depth / available quantity
  feePerShare: number; // Fee (>0) or rebate (<0) per share
  fillProbability: number; // Historical fill likelihood (0..1)
}

export interface FragmentedAllocationRequest {
  totalOrderQuantity: number;
  underfillPenaltyPerShare: number;
  venues: VenueParameter[];
}

export interface VenueAllocation {
  venueId: string;
  allocatedShares: number;
  effectiveCost: number;
  expectedFillShares: number;
}

export interface FragmentedPlacementResult {
  allocations: VenueAllocation[];
  totalAllocated: number;
  expectedShortfallShares: number;
  totalExpectedCost: number;
}

export function computeOptimalFragmentedPlacement(
  request: FragmentedAllocationRequest
): FragmentedPlacementResult {
  const { totalOrderQuantity, underfillPenaltyPerShare, venues } = request;

  // Sort venues by attractiveness: higher fill probability, lower fee
  const rankedVenues = [...venues].sort((a, b) => {
    const netAttractivenessA = a.fillProbability * underfillPenaltyPerShare - a.feePerShare;
    const netAttractivenessB = b.fillProbability * underfillPenaltyPerShare - b.feePerShare;
    return netAttractivenessB - netAttractivenessA;
  });

  let remainingShares = totalOrderQuantity;
  const allocations: VenueAllocation[] = [];
  let totalExpectedFill = 0;
  let totalCost = 0;

  for (const v of rankedVenues) {
    const alloc = Math.min(remainingShares, v.depthAvailable);
    const expectedFill = alloc * v.fillProbability;
    const cost = alloc * v.feePerShare;

    allocations.push({
      venueId: v.venueId,
      allocatedShares: alloc,
      effectiveCost: cost,
      expectedFillShares: expectedFill,
    });

    remainingShares -= alloc;
    totalExpectedFill += expectedFill;
    totalCost += cost;

    if (remainingShares <= 0) break;
  }

  // Include any remaining venues with zero allocation
  for (const v of rankedVenues) {
    if (!allocations.some((a) => a.venueId === v.venueId)) {
      allocations.push({
        venueId: v.venueId,
        allocatedShares: 0,
        effectiveCost: 0,
        expectedFillShares: 0,
      });
    }
  }

  const expectedShortfall = Math.max(0, totalOrderQuantity - totalExpectedFill);
  const totalAllocated = totalOrderQuantity - remainingShares;

  return {
    allocations,
    totalAllocated,
    expectedShortfallShares: expectedShortfall,
    totalExpectedCost: totalCost + expectedShortfall * underfillPenaltyPerShare,
  };
}
