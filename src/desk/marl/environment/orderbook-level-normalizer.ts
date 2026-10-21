/**
 * Order Book Level Normalization
 *
 * Converts a single raw price/size pair and per-venue raw book shapes into the
 * canonical MarlOrderBook. Split from the microstructure/observation side so
 * venue-format quirks stay isolated from feature math.
 */

import type { MarlOrderBook, MarlOrderBookLevel } from '../types/marl-types';

export interface RawCexOrderBook {
  symbol: string;
  venue?: string;
  bids?: Array<[string | number, string | number]>;
  asks?: Array<[string | number, string | number]>;
  timestamp?: number;
}

export interface RawClobOrderBook {
  symbol?: string;
  tokenId?: string;
  bids?: Array<{ price: string | number; size: string | number }>;
  asks?: Array<{ price: string | number; size: string | number }>;
  timestamp?: number;
}

/** Price resolution (decimal places) kept on normalized levels. */
const PRICE_DECIMALS = 4;

/** Normalize one raw price/size pair, or null when either side is unusable. */
export function normalizeLevel(rawPrice: string | number, rawSize: string | number): MarlOrderBookLevel | null {
  const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
  const size = typeof rawSize === 'string' ? parseFloat(rawSize) : rawSize;
  if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return null;
  return { price: Number(price.toFixed(PRICE_DECIMALS)), size: Number(size.toFixed(PRICE_DECIMALS)) };
}

/** Normalize [price, size] tuple levels (CEX wire format). */
function normalizeTupleLevels(raw: Array<[string | number, string | number]> | undefined): MarlOrderBookLevel[] {
  const levels: MarlOrderBookLevel[] = [];
  for (const [p, s] of raw ?? []) {
    const lvl = normalizeLevel(p, s);
    if (lvl) levels.push(lvl);
  }
  return levels;
}

/** Normalize {price, size} object levels (Polymarket CLOB wire format). */
function normalizeObjectLevels(
  raw: Array<{ price: string | number; size: string | number }> | undefined,
): MarlOrderBookLevel[] {
  const levels: MarlOrderBookLevel[] = [];
  for (const item of raw ?? []) {
    if (!item) continue;
    const lvl = normalizeLevel(item.price, item.size);
    if (lvl) levels.push(lvl);
  }
  return levels;
}

/** Normalize a CEX order book: bids descending, asks ascending by price. */
export function normalizeCex(raw: RawCexOrderBook, venue = 'cex'): MarlOrderBook {
  const bids = normalizeTupleLevels(raw.bids);
  const asks = normalizeTupleLevels(raw.asks);

  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  return {
    symbol: raw.symbol,
    venue: raw.venue ?? venue,
    bids,
    asks,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

/** Normalize a Polymarket CLOB order book: bids descending, asks ascending. */
export function normalizeClob(raw: RawClobOrderBook, venue = 'polymarket'): MarlOrderBook {
  const bids = normalizeObjectLevels(raw.bids);
  const asks = normalizeObjectLevels(raw.asks);

  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  return {
    symbol: raw.symbol ?? raw.tokenId ?? 'POLY',
    venue,
    bids,
    asks,
    timestamp: raw.timestamp ?? Date.now(),
  };
}
