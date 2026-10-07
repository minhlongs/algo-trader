/**
 * Capital Efficiency Optimizer Types
 *
 * Contracts for multi-venue collateral monitoring, return-on-collateral (ROC)
 * ranking, and automated balance rebalancing recommendations.
 *
 * @module desk/portfolio/capital-efficiency-types
 */

export interface VenueCollateralInfo {
  readonly venue: string;
  readonly availableUsd: number;
  readonly lockedMarginUsd: number;
  readonly totalEquityUsd: number;
  readonly targetAllocationPct: number; // e.g. 0.50 (50%)
}

export interface RebalanceRecommendation {
  readonly fromVenue: string;
  readonly toVenue: string;
  readonly transferAmountUsd: number;
  readonly reason: string;
}

export interface CapitalEfficiencyReport {
  readonly totalPortfolioEquityUsd: number;
  readonly totalIdleCapitalUsd: number;
  readonly overallMarginUtilizationPct: number;
  readonly recommendations: readonly RebalanceRecommendation[];
  readonly timestamp: number;
}
