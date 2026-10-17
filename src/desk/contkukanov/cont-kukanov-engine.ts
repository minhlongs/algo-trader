/**
 * Wave 221: Cont & Kukanov (2017) Optimal Order Placement Across Venues Engine.
 *
 * Exposes router optimizer for multi-venue liquidity execution.
 * Strictly < 100 LOC, zero mocks, zero :any.
 */

import type { SmartRoutingConfig, OptimalRoutingResult } from './cont-kukanov-types';
import { ContKukanovMath } from './cont-kukanov-math';

export class ContKukanovEngine {
  constructor(private readonly config: SmartRoutingConfig) {}

  public computeOptimalRouting(): OptimalRoutingResult {
    return ContKukanovMath.optimizeOrderPlacement(this.config);
  }

  public getTopAllocatedVenue(): string | null {
    const result = this.computeOptimalRouting();
    if (result.allocations.length === 0) return null;
    const sorted = [...result.allocations].sort((a, b) => b.allocatedShares - a.allocatedShares);
    return sorted[0].venueId;
  }
}
