/**
 * Delta & Inventory Hedger Types
 *
 * Domain contracts for measuring directional delta exposure and generating
 * cross-venue offsetting hedge allocations.
 *
 * @module desk/risk/delta-inventory-hedger-types
 */

import type { OutcomeSide, OrderAction } from '../execution/pm-sor-types';

export interface VenuePositionDelta {
  readonly venue: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly quantity: number;
  readonly currentProbability: number; // delta per contract is approx the probability
}

export interface DeltaRiskConfig {
  readonly maxNetDeltaUsd: number; // threshold to trigger hedging
  readonly targetNetDeltaUsd?: number; // target delta after hedge (default: 0)
  readonly minHedgeNotionalUsd?: number; // avoid micro-hedges
}

export interface RecommendedHedgeOrder {
  readonly targetVenue: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly quantity: number;
  readonly estimatedPrice: number;
  readonly estimatedNotionalUsd: number;
}

export interface PortfolioDeltaAssessment {
  readonly totalNetDeltaUsd: number;
  readonly isBreached: boolean;
  readonly recommendedHedges: readonly RecommendedHedgeOrder[];
  readonly timestamp: number;
}
