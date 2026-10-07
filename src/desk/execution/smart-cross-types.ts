/**
 * Smart Cross Router Types
 *
 * Contracts for order split optimization across Constant Product AMMs
 * and Central Limit Order Books (CLOB) to minimize execution shortfall.
 *
 * @module desk/execution/smart-cross-types
 */

export interface AmmLiquidityPool {
  readonly poolId: string;
  readonly reserveOutcome: number; // e.g. shares
  readonly reserveCollateral: number; // e.g. USDC
  readonly feeRate: number; // e.g. 0.003 for 0.3%
}

export interface ClobLevel {
  readonly price: number;
  readonly availableQuantity: number;
}

export interface ClobBook {
  readonly bookId: string;
  readonly asks: readonly ClobLevel[];
  readonly feeRate: number;
}

export interface RouteSplitAllocation {
  readonly venueType: 'AMM' | 'CLOB';
  readonly venueId: string;
  readonly allocatedQuantity: number;
  readonly effectiveAvgPrice: number;
  readonly expectedCostUsd: number;
}

export interface OptimizedCrossRoute {
  readonly totalRequestedQuantity: number;
  readonly totalAllocatedQuantity: number;
  readonly totalCostUsd: number;
  readonly blendedAvgPrice: number;
  readonly allocations: readonly RouteSplitAllocation[];
}
