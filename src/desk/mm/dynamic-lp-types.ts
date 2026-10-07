/**
 * Dynamic Liquidity Provision & Inventory Skew Types
 *
 * Domain contracts for binary prediction market automated market making,
 * inventory risk shading, and quote generation.
 *
 * @module desk/mm/dynamic-lp-types
 */

export interface DynamicLpConfig {
  readonly targetSpreadPct?: number; // base full spread, e.g. 0.04 (4%)
  readonly maxInventoryAbs?: number; // max inventory shares before 100% asymmetric shading
  readonly inventoryRiskAversion?: number; // gamma factor for inventory skew (default: 0.5)
  readonly orderSizeShares?: number; // standard quoting size per level
  readonly minSpreadPct?: number; // minimum half-spread or floor (default: 0.01)
}

export const DEFAULT_DYNAMIC_LP_CONFIG: Required<DynamicLpConfig> = {
  targetSpreadPct: 0.04,
  maxInventoryAbs: 500,
  inventoryRiskAversion: 0.5,
  orderSizeShares: 50,
  minSpreadPct: 0.01,
};

export interface MarketMakingContext {
  readonly marketId: string;
  readonly fairProbability: number; // fundamental probability estimate [0.01, 0.99]
  readonly currentInventoryShares: number; // positive = net long YES; negative = net long NO
  readonly volatilityIndex?: number; // normalized market volatility (default: 1.0)
  readonly isToxicFlowDetected?: boolean; // wide-spread toxic flow regime indicator
}

export interface TwoSidedQuote {
  readonly quoteId: string;
  readonly marketId: string;
  readonly bidPrice: number; // bid to buy YES
  readonly askPrice: number; // ask to sell YES
  readonly bidSize: number;
  readonly askSize: number;
  readonly effectiveSpread: number;
  readonly inventorySkewOffset: number;
  readonly timestamp: number;
}
