/**
 * OrderBookStream — message parsing.
 * Pure functions extracted from orderbook-stream.ts. Bodies moved VERBATIM; zero behavior change.
 */

import type { PriceUpdatePayload } from '../events/trading-event-bus';
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

/** Merge incoming bestBid/bestAsk with last known prices and build PriceUpdatePayload. */
export function mergeAndBuildPricePayload(
  tokenId: string,
  bestBid: number,
  bestAsk: number,
  existing: { bestBid: number; bestAsk: number } | undefined,
): { mergedBid: number; mergedAsk: number; payload: PriceUpdatePayload } | null {
  const prev = existing ?? { bestBid: 0, bestAsk: 0 };
  const mergedBid = bestBid > 0 ? bestBid : prev.bestBid;
  const mergedAsk = bestAsk > 0 ? bestAsk : prev.bestAsk;
  if (mergedBid === 0 && mergedAsk === 0) return null;
  const spread = mergedAsk > 0 && mergedBid > 0 ? mergedAsk - mergedBid : 0;
  const spreadBps = spread > 0 && mergedBid > 0 ? (spread / mergedBid) * 10_000 : 0;
  return {
    mergedBid,
    mergedAsk,
    payload: { tokenId, bid: mergedBid, ask: mergedAsk, timestamp: Date.now(), spread, spreadBps },
  };
}

/** Build JSON subscription message for a token ID. */
export function buildSubscribePayload(tokenId: string): string {
  return JSON.stringify({
    type: 'subscribe',
    assets_ids: [tokenId],
    channels: ['price_change', 'trade', 'book'],
  });
}