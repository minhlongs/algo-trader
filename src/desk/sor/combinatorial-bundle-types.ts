/**
 * Combinatorial Bundle Router Types
 *
 * Contracts for executing multi-leg conditional token outcome bundles
 * with atomic leg-locking and fill ratio skew bounds.
 *
 * @module desk/sor/combinatorial-bundle-types
 */

export interface BundleLegSpec {
  readonly legId: string;
  readonly marketId: string;
  readonly outcome: 'YES' | 'NO';
  readonly targetQuantity: number;
  readonly maxLimitPrice: number;
}

export interface AvailableLegDepth {
  readonly marketId: string;
  readonly bestOfferPrice: number;
  readonly availableQuantity: number;
}

export interface BundleFillResult {
  readonly bundleId: string;
  readonly isFullyFilled: boolean;
  readonly executedLegs: readonly LegExecutionDetail[];
  readonly aggregateCostUsd: number;
  readonly blendedBundlePrice: number;
  readonly maxSkewDiscrepancy: number;
  readonly rollbackRequired: boolean;
}

export interface LegExecutionDetail {
  readonly legId: string;
  readonly marketId: string;
  readonly targetQuantity: number;
  readonly filledQuantity: number;
  readonly averagePrice: number;
  readonly fillRatio: number;
}
