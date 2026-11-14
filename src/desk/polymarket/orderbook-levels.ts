/**
 * CLOB Book Levels — the smallest shared view of an orderbook
 *
 * The CLOB delivers prices and sizes as decimal strings. Both the taker sweep
 * and the maker queue model need them as numbers, and both need to agree on
 * what "this price" means, so the tolerance and the crossing test live here
 * rather than being repeated in each caller.
 */

import type { FillBookLevel } from './queue-aware-fill-simulator';

/**
 * Prices are fixed-point with at most a handful of decimals, so two levels are
 * the same price when they differ by less than this. Comparing floats exactly
 * would split a level in two.
 */
export const LEVEL_PRICE_EPSILON = 1e-9;

export interface ParsedLevel {
  price: number;
  size: number;
}

/** Parses book levels, dropping anything unreadable or empty. */
export function parseLevels(rawLevels: FillBookLevel[]): ParsedLevel[] {
  return rawLevels
    .map((lvl) => ({ price: parseFloat(lvl.price), size: parseFloat(lvl.size) }))
    .filter((lvl) => Number.isFinite(lvl.price) && Number.isFinite(lvl.size) && lvl.size > 0);
}

/** True when the limit price is good enough to trade against the resting side. */
export function isMarketable(
  levels: ParsedLevel[],
  side: 'BUY' | 'SELL',
  limitPrice: number,
): boolean {
  const best = levels.reduce<number | null>((acc, lvl) => {
    if (acc === null) return lvl.price;
    return side === 'BUY' ? Math.min(acc, lvl.price) : Math.max(acc, lvl.price);
  }, null);
  if (best === null) return false;
  return side === 'BUY'
    ? best <= limitPrice + LEVEL_PRICE_EPSILON
    : best >= limitPrice - LEVEL_PRICE_EPSILON;
}
