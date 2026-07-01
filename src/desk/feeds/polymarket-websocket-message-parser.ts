/**
 * Polymarket WebSocket message parser — raw WS event → PriceUpdate partial.
 * Isolated here to keep the main feed file under 200 lines.
 */

import { PriceUpdate } from './polymarket-websocket-feed';

// ---------------------------------------------------------------------------
// Raw Polymarket WS event shapes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParsedEvent {
  tokenId: string;
  partial: Partial<PriceUpdate>;
}

/** Parse a raw Polymarket WS message string into zero or more price partials. */
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
      const yesPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
      results.push({ tokenId, partial: { bestBid, bestAsk, yesPrice, noPrice: 1 - yesPrice } });
    } else if (type === 'trade') {
      const data = event.data as RawTradeEvent | undefined;
      const price = parseFloat((data?.price ?? event.price ?? '0') as string);
      const size = parseFloat((data?.size ?? event.size ?? '0') as string);
      results.push({ tokenId, partial: { lastTradePrice: price, volume24h: size } });
    }
  }

  return results;
}
