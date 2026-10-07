/**
 * Liquidity Score Engine Types
 *
 * Contracts for multi-tier depth aggregation, effective spread scoring,
 * market resilience evaluation, and execution capacity index.
 *
 * @module desk/market-data/liquidity-score-types
 */

export interface OrderBookLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface OrderBookSnapshot {
  readonly marketId: string;
  readonly timestamp: number;
  readonly bids: readonly OrderBookLevel[];
  readonly asks: readonly OrderBookLevel[];
}

export interface LiquidityBandDepth {
  readonly bandPct: number; // e.g. 0.01 for 1%
  readonly bidNotionalUsd: number;
  readonly askNotionalUsd: number;
  readonly totalNotionalUsd: number;
}

export interface CompositeLiquidityScore {
  readonly marketId: string;
  readonly timestamp: number;
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly midPrice: number;
  readonly spreadBps: number;
  readonly spreadScore: number; // 0-100
  readonly depthScore: number;  // 0-100
  readonly compositeScore: number; // 0-100
  readonly bands: readonly LiquidityBandDepth[];
  readonly maxRecommendedOrderSizeUsd: number;
}
