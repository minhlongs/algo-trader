/**
 * Smart Money Divergence Math & Helpers
 *
 * @module desk/strategies/polymarket/smart-money-divergence-math
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import { calcOBI } from './strategy-math-helpers';

/** Compute smart money OBI using only the top N levels of the book. */
export function computeSmartOBI(book: RawOrderBook, levels: number): number {
  const smartBids = book.bids.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const smartAsks = book.asks.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  return calcOBI(smartBids, smartAsks);
}

/** Determine if price trend is up or down. Returns 1 (up), -1 (down), 0 (flat). */
export function getTrendDirection(prices: number[]): number {
  if (prices.length < 3) return 0;
  const recent = prices.slice(-3);
  const up = recent[2]! > recent[0]!;
  const down = recent[2]! < recent[0]!;
  if (up) return 1;
  if (down) return -1;
  return 0;
}

/**
 * Detect divergence: smart money OBI points one way, price trend the other.
 * OBI > 1 + threshold = smart money is buying, OBI < 1 - threshold = selling.
 * Returns 'yes' (smart money buying despite downtrend) or 'no' (smart money selling despite uptrend).
 */
export function detectDivergence(obi: number, trend: number, threshold: number): 'yes' | 'no' | null {
  if (obi > 1 + threshold && trend < 0) return 'yes';
  if (obi < 1 - threshold && trend > 0) return 'no';
  return null;
}
