/**
 * Polymarket CLOB WebSocket Feed Types & Constants
 *
 * @module desk/feeds/polymarket-websocket-feed-types
 */

export interface PriceUpdate {
  tokenId: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  volume24h: number;
  timestamp: number;
}

export const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
export const NATS_TOPIC_TEMPLATE = 'market.TOKEN.update';
export const HEARTBEAT_MS = 30_000;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
