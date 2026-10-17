/**
 * Multi-Venue Streamer Protocol & Subscriptions
 *
 * @module desk/data/multi-venue-streamer-protocol
 */

import { logger } from '../../shared/utils/logger';
import type { SupportedVenue, WebSocketLike } from './multi-venue-streamer-types';

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
      ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: [`${symbol.toLowerCase()}@depth@100ms`, `${symbol.toLowerCase()}@trade`],
          id: Date.now(),
        })
      );
    } else if (venue === 'hyperliquid') {
      ws.send(
        JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'l2Book', coin: symbol },
        })
      );
    } else if (venue === 'polymarket') {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          assets_ids: [symbol],
        })
      );
    }
  } catch (err) {
    logger.warn(`[MultiVenueStreamer] Send sub error ${venue}:${symbol}`, { err });
  }
}
