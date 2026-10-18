/**
 * Multi-Venue Streamer Protocol & Subscriptions
 *
 * @module desk/data/multi-venue-streamer-protocol
 */

import { logger } from '../../shared/utils/logger';
import { parseVenueOrderBook, parseVenueTrade } from './multi-venue-streamer-parsers';
import type {
  SupportedVenue,
  UnifiedOrderBook,
  UnifiedTrade,
  VenueConnectionState,
  WebSocketLike,
} from './multi-venue-streamer-types';

export const VENUE_URLS: Record<SupportedVenue, string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  hyperliquid: 'wss://api.hyperliquid.xyz/ws',
  polymarket: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
};

/**
 * Format and send venue-specific subscription payloads
 */
export function sendVenueSubscription(
  venue: SupportedVenue,
  ws: WebSocketLike,
  symbol: string
): void {
  try {
    if (venue === 'binance') {
      ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`${symbol.toLowerCase()}@depth@100ms`, `${symbol.toLowerCase()}@trade`],
        id: Date.now(),
      }));
    } else if (venue === 'hyperliquid') {
      ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: symbol },
      }));
    } else if (venue === 'polymarket') {
      ws.send(JSON.stringify({
        type: 'subscribe',
        assets_ids: [symbol],
      }));
    }
  } catch (err) {
    logger.warn(`[MultiVenueStreamer] Send sub error ${venue}:${symbol}`, { err });
  }
}

export function createInitialVenueState(venue: SupportedVenue): VenueConnectionState {
  return { venue, connected: false, reconnectAttempts: 0, lastHeartbeat: 0 };
}

export function markVenueOpened(
  state: VenueConnectionState | undefined,
  venue: SupportedVenue,
  ws: WebSocketLike,
  subs: Set<string> | undefined,
): void {
  if (state) {
    state.connected = true;
    state.reconnectAttempts = 0;
    state.lastHeartbeat = Date.now();
  }
  if (subs) {
    for (const sym of subs) sendVenueSubscription(venue, ws, sym);
  }
}

export function dispatchRawVenueMessage(
  venue: SupportedVenue,
  rawData: unknown,
  state: VenueConnectionState | undefined,
  onBook: (book: UnifiedOrderBook) => void,
  onTrade: (trade: UnifiedTrade) => void,
): void {
  if (state) state.lastHeartbeat = Date.now();
  try {
    const msg = JSON.parse(typeof rawData === 'string' ? rawData : String(rawData)) as Record<string, unknown>;
    const book = parseVenueOrderBook(venue, msg);
    if (book) onBook(book);
    const trade = parseVenueTrade(venue, msg);
    if (trade) onTrade(trade);
  } catch (err) {
    logger.debug(`[MultiVenueStreamer] Parse fail on ${venue}`, { err });
  }
}

export function computeReconnectBackoffDelay(
  reconnectBaseMs: number,
  reconnectMaxMs: number,
  reconnectAttempts: number,
): number {
  return Math.min(reconnectBaseMs * Math.pow(2, reconnectAttempts), reconnectMaxMs);
}
