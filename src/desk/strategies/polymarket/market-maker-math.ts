/**
 * Pure quote, spread, and inventory math helpers & types for Market Maker Strategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface MarketMakerConfig {
  /** Base spread fraction (0.01 = 1%) around fair value */
  baseSpread: number;
  /** Quote size per side in USDC */
  quoteSizeUsdc: number;
  /** How often to refresh quotes (ms) */
  refreshIntervalMs: number;
  /** Max inventory skew before widening spread */
  maxInventorySkew: number;
  /** Spread multiplier when inventory is maximally skewed */
  skewSpreadMultiplier: number;
  /** Minimum liquidity (USDC) to consider a market */
  minLiquidity: number;
}

export const DEFAULT_CONFIG: MarketMakerConfig = {
  baseSpread: 0.02,
  quoteSizeUsdc: 25,
  refreshIntervalMs: 20_000,
  maxInventorySkew: 3,
  skewSpreadMultiplier: 2.0,
  minLiquidity: 1000,
};

// ── Per-market state ──────────────────────────────────────────────────────────

export interface MmMarket {
  yesTokenId: string;
  noTokenId?: string;
  conditionId: string;
  volume: number;
  liquidity: number;
}

export interface MmMarketState {
  info: MmMarket;
  fairValue: number;
  confidence: number;
  bidPlaced: number;   // timestamp of last bid
  askPlaced: number;   // timestamp of last ask
  inventorySkew: number; // > 0 = long, < 0 = short
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute bid price with skew-adjusted spread. */
export function computeBidPrice(
  fairValue: number,
  spread: number,
  skew: number,
  skewMultiplier: number,
): number {
  const adjustedSpread = spread * (1 + Math.max(0, skew) * (skewMultiplier - 1) / 3);
  return Math.max(0.01, fairValue - adjustedSpread / 2);
}

/** Compute ask price with skew-adjusted spread. */
export function computeAskPrice(
  fairValue: number,
  spread: number,
  skew: number,
  skewMultiplier: number,
): number {
  const adjustedSpread = spread * (1 + Math.max(0, -skew) * (skewMultiplier - 1) / 3);
  return Math.min(0.99, fairValue + adjustedSpread / 2);
}

/** Update inventory skew from trade activity. */
export function updateSkew(currentSkew: number, sideFilled: 'bid' | 'ask'): number {
  return sideFilled === 'bid' ? currentSkew + 1 : currentSkew - 1;
}

/** Extract best bid, ask, and mid price from an order book. */
export function computeBestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}
