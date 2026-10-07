/**
 * Portfolio Kelly Criterion & Optimization Types
 *
 * @module alpha-lab/portfolio/kelly-optimizer-types
 */

export interface PredictionBetCandidate {
  assetId: string;
  marketPrice: number; // e.g. 0.40
  estimatedProbability: number; // e.g. 0.55
  maxFractionCap?: number; // e.g. 0.10 for max 10% NAV
}

export interface KellyAllocationResult {
  assetId: string;
  edge: number; // estimatedProbability - marketPrice
  fullKellyFraction: number;
  allocatedFraction: number;
  allocatedAmountUsd: number;
  expectedGrowthRate: number;
}

export interface PortfolioKellySummary {
  portfolioNav: number;
  fractionalMultiplier: number; // e.g. 0.5 for Half-Kelly
  totalAllocatedFraction: number;
  totalAllocatedUsd: number;
  unallocatedCashUsd: number;
  allocations: KellyAllocationResult[];
}
