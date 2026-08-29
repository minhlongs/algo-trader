/**
 * OrderBookStream — types & constants.
 * Extracted from orderbook-stream.ts. Interfaces/constants moved VERBATIM; zero behavior change.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────
export const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Internal Types ────────────────────────────────────────────────────────────

export interface RawBookEvent {
  asset_id?: string;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  timestamp?: string;
}

export interface RawTradeEvent {
  asset_id?: string;
  price?: string;
  size?: string;
  side?: string;
  timestamp?: string;
}

export interface RawWsEvent {
  event_type?: string;
  type?: string;
  asset_id?: string;
  market?: string;
  bids?: RawBookEvent['bids'];
  asks?: RawBookEvent['asks'];
  price?: string;
  size?: string;
  data?: RawBookEvent | RawTradeEvent | unknown;
  [key: string]: unknown;
}

export interface ParsedEvent {
  tokenId: string;
  bestBid: number;
  bestAsk: number;
  lastTradePrice?: number;
  volume24h?: number;
}