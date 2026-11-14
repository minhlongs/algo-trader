/**
 * Normalise raw Polymarket CLOB market-channel messages into L2 log rows.
 *
 * Live message shapes (verified 2026-11-12 against wss://ws-subscriptions-clob.polymarket.com/ws/market):
 *
 *   { event_type: 'book', market, asset_id, timestamp, hash, bids: [...], asks: [...], tick_size, last_trade_price }
 *   { event_type: 'price_change', market, timestamp,
 *     price_changes: [{ asset_id, price, size, side, hash, best_bid, best_ask }] }
 *
 * A `price_change` batch is fanned out into one row per change:
 * `side: 'BUY'` touches the bid ladder, `side: 'SELL'` the ask ladder (verified: a
 * reconstructed book from a snapshot plus its deltas matches the next snapshot exactly).
 * Levels are kept as the exchange's strings so replay is lossless.
 */

import type { L2PriceLevel, RecordedL2Row } from './l2-event-types';
import { L2_SOURCE_RECORDED } from './l2-source-labels';

interface RawLevel {
  price?: unknown;
  size?: unknown;
}

interface RawPriceChange {
  asset_id?: unknown;
  price?: unknown;
  size?: unknown;
  side?: unknown;
}

interface RawMarketMessage {
  event_type?: unknown;
  type?: unknown;
  market?: unknown;
  asset_id?: unknown;
  timestamp?: unknown;
  hash?: unknown;
  bids?: unknown;
  asks?: unknown;
  tick_size?: unknown;
  last_trade_price?: unknown;
  price_changes?: unknown;
}

function toLevel(raw: RawLevel): L2PriceLevel | null {
  const price = raw?.price;
  const size = raw?.size;
  if (typeof price !== 'string' && typeof price !== 'number') return null;
  if (typeof size !== 'string' && typeof size !== 'number') return null;
  return { price: String(price), size: String(size) };
}

function toLevels(raw: unknown): L2PriceLevel[] {
  if (!Array.isArray(raw)) return [];
  const levels: L2PriceLevel[] = [];
  for (const entry of raw) {
    const level = toLevel(entry as RawLevel);
    if (level) levels.push(level);
  }
  return levels;
}

/** Exchange timestamps arrive as epoch-millisecond strings. Fall back to `nowMs`. */
function toEpochMs(raw: unknown, nowMs: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed);
  }
  return nowMs;
}

function asOptionalString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function buildBookRow(msg: RawMarketMessage, nowMs: number): RecordedL2Row | null {
  const assetId = asOptionalString(msg.asset_id);
  if (!assetId) return null;
  return {
    t: toEpochMs(msg.timestamp, nowMs),
    source: L2_SOURCE_RECORDED,
    assetId,
    eventType: 'book',
    bids: toLevels(msg.bids),
    asks: toLevels(msg.asks),
    market: asOptionalString(msg.market),
    hash: asOptionalString(msg.hash),
    tickSize: asOptionalString(msg.tick_size),
    lastTradePrice: asOptionalString(msg.last_trade_price),
  };
}

function buildPriceChangeRows(msg: RawMarketMessage, nowMs: number): RecordedL2Row[] {
  const changes = Array.isArray(msg.price_changes) ? (msg.price_changes as RawPriceChange[]) : [];
  const t = toEpochMs(msg.timestamp, nowMs);
  const market = asOptionalString(msg.market);
  const rows: RecordedL2Row[] = [];

  for (const change of changes) {
    const assetId = asOptionalString(change.asset_id);
    const level = toLevel({ price: change.price, size: change.size });
    const side = asOptionalString(change.side);
    if (!assetId || !level || (side !== 'BUY' && side !== 'SELL')) continue;
    const isBid = side === 'BUY';
    rows.push({
      t,
      source: L2_SOURCE_RECORDED,
      assetId,
      eventType: 'price_change',
      bids: isBid ? [level] : [],
      asks: isBid ? [] : [level],
      market,
      hash: asOptionalString((change as { hash?: unknown }).hash),
    });
  }

  return rows;
}

/**
 * Parse one raw WebSocket frame into L2 rows in received order.
 * Returns `[]` for non-book frames (trades, heartbeats, unknown types) rather than throwing.
 */
export function normalizeMarketMessage(raw: string, nowMs: number = Date.now()): RecordedL2Row[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const rows: RecordedL2Row[] = [];

  for (const message of messages) {
    if (typeof message !== 'object' || message === null) continue;
    const msg = message as RawMarketMessage;
    const type = asOptionalString(msg.event_type) ?? asOptionalString(msg.type);
    if (type === 'book') {
      const row = buildBookRow(msg, nowMs);
      if (row) rows.push(row);
    } else if (type === 'price_change') {
      rows.push(...buildPriceChangeRows(msg, nowMs));
    }
  }

  return rows;
}
