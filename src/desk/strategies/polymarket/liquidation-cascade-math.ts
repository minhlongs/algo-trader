/**
 * Pure mathematical calculations for Liquidation Cascade Strategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';

/**
 * Compute percentage price change between two prices.
 */
export function calcPriceChangePct(prev: number, curr: number): number {
  if (prev <= 0) return 0;
  return (curr - prev) / prev;
}

/**
 * Estimate volume absorbed during a cascade by comparing book depth.
 * Returns fraction of the thinner side that was consumed.
 */
export function calcVolumeAbsorption(
  prevBook: RawOrderBook,
  currBook: RawOrderBook,
  direction: 'up' | 'down',
): number {
  if (direction === 'down') {
    // Price fell: bids were consumed (buy-side liquidations)
    const prevBidDepth = prevBook.bids.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const currBidDepth = currBook.bids.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const consumed = prevBidDepth - currBidDepth;
    return prevBidDepth > 0 ? Math.max(0, consumed / prevBidDepth) : 0;
  } else {
    // Price rose: asks were consumed (sell-side liquidations)
    const prevAskDepth = prevBook.asks.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const currAskDepth = currBook.asks.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const consumed = prevAskDepth - currAskDepth;
    return prevAskDepth > 0 ? Math.max(0, consumed / prevAskDepth) : 0;
  }
}
