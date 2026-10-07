/**
 * Multi-Venue Market Streamer Types & Interfaces
 */

export type SupportedVenue = 'binance' | 'hyperliquid' | 'polymarket';

export interface BookLevel {
  price: number;
  amount: number;
}

export interface UnifiedOrderBook {
  venue: SupportedVenue;
  symbol: string;
  timestamp: number;
  seq: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface UnifiedTrade {
  venue: SupportedVenue;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  tradeId: string;
}

export interface StreamerConfig {
  venues?: SupportedVenue[];
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  maxReconnectAttempts?: number;
}

export interface VenueConnectionState {
  venue: SupportedVenue;
  connected: boolean;
  reconnectAttempts: number;
  lastHeartbeat: number;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners?(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;
