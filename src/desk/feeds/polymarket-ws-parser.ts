/**
 * Polymarket WebSocket Message Parser
 * Subroutines for building price, trade, and book WebSocketMessage payloads
 */

import { WebSocketMessage } from './websocket-client';
import {
  PolymarketRawMessage,
  PolymarketPrice,
  PolymarketOrderBook,
} from './polymarket-ws-types';

/** Safely parse raw timestamp string or number into epoch milliseconds */
export function parseRawTimestamp(timestamp?: string | number): number {
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  if (typeof timestamp === 'string') {
    const parsed = parseInt(timestamp, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/** Build a ticker WebSocketMessage from raw price update */
export function buildPriceMessage(
  tokenId: string,
  msg: PolymarketRawMessage,
  timestamp: number
): WebSocketMessage {
  const price: PolymarketPrice = {
    tokenId,
    price: parseFloat(msg.price || '0'),
    side: (msg.side as 'buy' | 'sell') || 'buy',
    size: parseFloat(msg.size || '0'),
    timestamp,
  };
  return {
    type: 'ticker',
    exchange: 'polymarket',
    symbol: tokenId,
    data: price,
    timestamp,
  };
}

/** Build a trade WebSocketMessage from raw trade update */
export function buildTradeMessage(
  tokenId: string,
  msg: PolymarketRawMessage,
  timestamp: number
): WebSocketMessage {
  return {
    type: 'trade',
    exchange: 'polymarket',
    symbol: tokenId,
    data: {
      tokenId,
      price: parseFloat(msg.price || '0'),
      size: parseFloat(msg.size || '0'),
      side: msg.side || 'buy',
      timestamp,
    },
    timestamp,
  };
}

/** Build an orderbook snapshot WebSocketMessage from raw book update */
export function buildBookMessage(
  tokenId: string,
  msg: PolymarketRawMessage,
  timestamp: number
): WebSocketMessage {
  const book: PolymarketOrderBook = {
    tokenId,
    bids: (msg.bids || []).map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
    asks: (msg.asks || []).map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
    timestamp,
  };
  return {
    type: 'orderbook',
    exchange: 'polymarket',
    symbol: tokenId,
    data: book,
    timestamp,
  };
}
