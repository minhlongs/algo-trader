/**
 * Pure calculation functions for Price Impact Estimator strategy.
 *
 * These functions analyze orderbook depth to estimate price impact of
 * hypothetical orders and detect asymmetric liquidity patterns.
 */
import type { RawOrderBook } from '../../polymarket/clob-client';

/**
 * Walk through orderbook levels filling orderSize, return volume-weighted
 * average fill price. Returns 0 if insufficient liquidity.
 *
 * Algorithm: iterates through price levels, consuming available size at each
 * level until the full orderSize is filled or liquidity runs out.
 */
export function simulatePriceImpact(
  levels: RawOrderBook['asks'],
  orderSize: number,
): number {
  if (orderSize <= 0) return 0;
  if (levels.length === 0) return 0;

  let remaining = orderSize;
  let totalCost = 0;
  let totalFilled = 0;

  for (const level of levels) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    if (size <= 0 || price <= 0) continue;

    const fillAmount = Math.min(remaining, size);
    totalCost += fillAmount * price;
    totalFilled += fillAmount;
    remaining -= fillAmount;

    if (remaining <= 0) break;
  }

  if (remaining > 0) return 0; // insufficient liquidity
  if (totalFilled === 0) return 0;

  return totalCost / totalFilled;
}

/**
 * Calculate impact asymmetry: |buyImpact - sellImpact| / mid.
 * Returns 0 if mid is 0.
 */
export function calcImpactAsymmetry(
  buyImpact: number,
  sellImpact: number,
  mid: number,
): number {
  if (mid === 0) return 0;
  return Math.abs(buyImpact - sellImpact) / mid;
}

/**
 * Determine which side to trade based on impact comparison.
 * buyImpact < sellImpact → 'yes' (strong bid support)
 * sellImpact < buyImpact → 'no' (strong ask resistance)
 * equal → null
 */
export function determineSide(
  buyImpact: number,
  sellImpact: number,
): 'yes' | 'no' | null {
  if (buyImpact < sellImpact) return 'yes';
  if (sellImpact < buyImpact) return 'no';
  return null;
}

/**
 * Update an exponential moving average with a simple alpha-based formula.
 * newEma = alpha * value + (1 - alpha) * prev
 * Returns value when there is no previous EMA (initial case).
 */
export function updateImpactEma(
  prev: number | null,
  value: number,
  alpha: number,
): number {
  if (prev === null) return value;
  if (alpha <= 0) return prev;
  if (alpha >= 1) return value;
  return alpha * value + (1 - alpha) * prev;
}

/** Extract best bid/ask/mid from raw order book. */
export function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}
