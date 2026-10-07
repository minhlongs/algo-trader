/**
 * Synthetic & Combinatorial Pricing Engine Types
 *
 * Contracts for multi-outcome probability simplex verification,
 * Fréchet bounds consistency, and combinatorial package arbitrage.
 *
 * @module desk/pricing/synthetic-combinatorial-types
 */

export interface OutcomeProbability {
  readonly outcomeId: string;
  readonly price: number;
}

export interface SimplexValidationResult {
  readonly marketId: string;
  readonly sumProbabilities: number;
  readonly isConsistent: boolean;
  readonly arbitrageDiscrepancy: number; // e.g. 1.05 -> overpriced by 0.05
}

export interface FrechetBoundsResult {
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly observedJointPrice: number;
  readonly isWithinBounds: boolean;
  readonly violationDiscrepancy: number;
}
