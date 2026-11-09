/**
 * OrderBookStream — message parsing, chunked WS subscriptions, and tick-size precision guards.
 * Pure functions extracted from orderbook-stream.ts.
 */

import type { PriceUpdatePayload } from '../events/trading-event-bus';
import {
  WS_SUBSCRIBE_CHUNK_SIZE,
  type ParsedEvent,
  type RawBookEvent,
  type RawTradeEvent,
  type RawWsEvent,
} from './orderbook-stream-types';

/**
 * Parse raw WebSocket message into structured price and tick-size events.
 * Handles 'book', 'price_change', 'trade', and 'tick_size_change' event types.
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
    } else if (type === 'tick_size_change') {
      const rawTick = event.new_tick_size ?? event.tick_size ?? '';
      const tickFloat = parseFloat(String(rawTick));
      if (Number.isFinite(tickFloat) && tickFloat > 0) {
        const tickSizeMicro = Math.max(1, Math.round(tickFloat * 1_000_000));
        results.push({ tokenId, bestBid: 0, bestAsk: 0, tickSizeMicro });
      }
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

/** Build JSON subscription message for a single token ID. */
export function buildSubscribePayload(tokenId: string): string {
  return JSON.stringify({
    type: 'subscribe',
    assets_ids: [tokenId],
    channels: ['price_change', 'trade', 'book', 'tick_size_change'],
  });
}

/** Split an iterable of token IDs into chunks of at most `chunkSize` (default 150) per frame. */
export function chunkAssetIdsForWsSubscribe(
  tokenIds: Iterable<string>,
  chunkSize: number = WS_SUBSCRIBE_CHUNK_SIZE,
): string[][] {
  const safeChunkSize =
    Number.isFinite(chunkSize) && chunkSize > 0
      ? Math.max(1, Math.floor(chunkSize))
      : WS_SUBSCRIBE_CHUNK_SIZE;
  const all = Array.from(tokenIds).filter((id) => id.length > 0);
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += safeChunkSize) {
    chunks.push(all.slice(i, i + safeChunkSize));
  }
  return chunks;
}

/** Build chunked JSON subscription frames (`<= 150` `assets_ids` per frame). */
export function buildChunkedSubscribePayloads(
  tokenIds: Iterable<string>,
  chunkSize: number = WS_SUBSCRIBE_CHUNK_SIZE,
): string[] {
  return chunkAssetIdsForWsSubscribe(tokenIds, chunkSize).map((chunk) =>
    JSON.stringify({
      type: 'subscribe',
      assets_ids: chunk,
      channels: ['price_change', 'trade', 'book', 'tick_size_change'],
    }),
  );
}

/**
 * Monotonic tick-size precision resolver: WebSocket `tick_size_change` precision
 * (e.g. `1_000` or `100` micro) is never overwritten by a coarser REST poll (`10_000` micro).
 */
export function resolveAuthoritativeTickSizeMicro(
  wsTickSizeMicro: number | undefined,
  restTickSizeMicro: number | undefined,
): number {
  const wsValid = wsTickSizeMicro !== undefined && wsTickSizeMicro > 0 ? wsTickSizeMicro : undefined;
  const restValid = restTickSizeMicro !== undefined && restTickSizeMicro > 0 ? restTickSizeMicro : undefined;
  if (wsValid !== undefined && restValid !== undefined) {
    return Math.min(wsValid, restValid);
  }
  return wsValid ?? restValid ?? 10_000;
}
