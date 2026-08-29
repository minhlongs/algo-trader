/**
 * OrderBookStream — message parsing.
 * Pure functions extracted from orderbook-stream.ts. Bodies moved VERBATIM; zero behavior change.
 */

import type {
  ParsedEvent,
  RawBookEvent,
  RawTradeEvent,
  RawWsEvent,
} from './orderbook-stream-types';

/**
 * Parse raw WebSocket message into structured price events.
 * Handles 'book', 'price_change', and 'trade' event types.
 */
export function parseWsMessage(raw: string): ParsedEvent[] {
  const parsed: RawWsEvent | RawWsEvent[] = JSON.parse(raw);
  const events = Array.isArray(parsed) ? parsed : [parsed];
  const results: ParsedEvent[] = [];

  for (const event of events) {
    const type = event.event_type ?? event.type ?? '';
    const tokenId = (event.asset_id ?? event.market ?? '') as string;

    if (!tokenId) continue;

    if (type === 'book' || type === 'price_change') {
      const data = event.data as RawBookEvent | undefined;
      const bids = data?.bids ?? event.bids ?? [];
      const asks = data?.asks ?? event.asks ?? [];
      const bestBid = bids.length ? parseFloat(bids[0].price) : 0;
      const bestAsk = asks.length ? parseFloat(asks[0].price) : 0;

      if (bestBid > 0 || bestAsk > 0) {
        results.push({ tokenId, bestBid, bestAsk });
      }
    } else if (type === 'trade') {
      const data = event.data as RawTradeEvent | undefined;
      const price = parseFloat((data?.price ?? event.price ?? '0') as string);
      const size = parseFloat((data?.size ?? event.size ?? '0') as string);
      results.push({ tokenId, bestBid: 0, bestAsk: 0, lastTradePrice: price, volume24h: size });
    }
  }

  return results;
}