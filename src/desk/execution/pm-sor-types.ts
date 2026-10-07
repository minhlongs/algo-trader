/**
 * Prediction Market Smart Order Router (SOR) Types
 *
 * Domain contracts for multi-venue prediction market order routing,
 * unified book depth slicing, and execution allocations.
 *
 * @module desk/execution/pm-sor-types
 */

import { VenueName } from '../arbitrage/cross-venue-types';

export type OutcomeSide = 'YES' | 'NO';
export type OrderAction = 'BUY' | 'SELL';

export interface BookLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface VenueBookSnapshot {
  readonly venue: VenueName;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly feeRate: number; // e.g. 0.001 for 10 bps
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
}

export interface RouteAllocation {
  readonly venue: VenueName;
  readonly marketId: string;
  readonly allocatedQuantity: number;
  readonly marginalPrice: number;
  readonly feeRate: number;
  readonly effectivePrice: number;
  readonly costOrProceedsUsd: number;
}

export interface SmartRoutePlan {
  readonly routeId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly averageEffectivePrice: number;
  readonly totalNetCostUsd: number;
  readonly allocations: readonly RouteAllocation[];
  readonly shouldSlice: boolean;
  readonly recommendedSlices: number;
}

export interface SorRouterConfig {
  readonly sliceThresholdRatio?: number; // ratio of top-level liquidity triggering slicing (default: 0.5)
  readonly maxSlices?: number; // max child orders for slicing (default: 5)
  readonly maxSlippageBps?: number; // max allowable slippage in bps (default: 200)
}
