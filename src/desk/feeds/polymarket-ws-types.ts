/**
 * Polymarket WebSocket Feed Types
 * Binary outcome prediction market interfaces, price updates, and orderbooks
 */

/** Binary outcome prediction market */
export interface PolymarketMarket {
  conditionId: string;
  questionId: string;
  question: string;
  outcomes: ['Yes', 'No'];
  tokens: [string, string]; // [yesTokenId, noTokenId]
}

/** Single price level update for a token */
export interface PolymarketPrice {
  tokenId: string;
  price: number;
  side: 'buy' | 'sell';
  size: number;
  timestamp: number;
}

/** Raw CLOB WebSocket message shape */
export interface PolymarketRawMessage {
  event_type?: string;
  type?: string;
  asset_id?: string;
  market?: string;
  price?: string;
  side?: string;
  size?: string;
  timestamp?: string | number;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
}

/** Orderbook snapshot for a token */
export interface PolymarketOrderBook {
  tokenId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}
