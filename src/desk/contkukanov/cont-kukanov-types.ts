/**
 * Wave 221: Cont & Kukanov (2017) Optimal Order Placement Across Venues Types.
 *
 * Implements multi-venue smart order routing balancing maker rebates,
 * queue priority, execution certainty, and adverse selection risk.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface VenueParameters {
  venueId: string;
  makerFeeBps: number;         // Can be negative for rebate (e.g. -0.2 bps)
  takerFeeBps: number;         // E.g. 0.3 bps
  queueDepthAheadShares: number; // Queue depth ahead at the touch
  fillProbability: number;     // Empirical probability of fill [0, 1]
  adverseSelectionPenaltyBps: number; // Cost of adverse selection on fill
}

export interface SmartRoutingConfig {
  venues: VenueParameters[];
  totalOrderShares: number;
  adverseSelectionAversion: number; // Penalty weight lambda
}

export interface VenueAllocation {
  venueId: string;
  allocatedShares: number;
  expectedFillRate: number;
  expectedCostBps: number;
}

export interface OptimalRoutingResult {
  totalOrderShares: number;
  allocations: VenueAllocation[];
  expectedTotalCostBps: number;
  effectiveRebateBps: number;
}
