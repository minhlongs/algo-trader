/**
 * Polymarket CLOB Adapter — shared types and constants
 * Extracted from polymarket-adapter.ts to keep files ≤200 LOC.
 * All consumers should import from polymarket-adapter.ts (re-exports everything here).
 */

export const CLOB_BASE = 'https://clob.polymarket.com';

// ── Response shapes from CLOB API ────────────────────────────────────────────

export interface PolymarketOrderResponse {
  orderID: string;
  status: 'matched' | 'delayed' | 'unmatched' | 'canceled';
  error?: string;
}

export interface PolymarketOpenOrder {
  id: string;
  asset_id: string;
  price: string;
  original_size: string;
  size_matched: string;
  side: 'BUY' | 'SELL';
  expiration: string;
  status: string;
  created_at: string;
}

export interface PolymarketBookLevel {
  price: string;
  size: string;
}

export interface PolymarketOrderBook {
  market: string;
  asset_id: string;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  hash: string;
  timestamp: string;
}

export interface PolymarketMarketInfo {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time?: string;
  resolution_source?: string;
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
  active: boolean;
  closed: boolean;
  archived: boolean;
  minimum_order_size: string;
  minimum_tick_size: string;
  category: string;
  fpmm?: string;
}
