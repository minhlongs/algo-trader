/**
 * Pure math and surface calculation helpers for Volatility Surface Arbitrage Strategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';

/**
 * Estimate implied volatility from order book depth.
 * Wider books with larger depth = lower IV (more liquidity = less uncertainty).
 * Narrow books with small depth = higher IV.
 * Returns a normalized score (higher = more volatile).
 */
export function estimateIV(book: RawOrderBook, levels: number): number {
  const bidDepth = book.bids.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const totalDepth = bidDepth + askDepth;

  const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
  const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
  const spread = bestAsk - bestBid;

  // IV estimate: higher when spread is wide and depth is shallow
  if (totalDepth <= 0) return 1;
  const spreadComponent = spread * 100; // spread as percentage
  const depthComponent = 1 / Math.log10(totalDepth + 10);
  return spreadComponent * depthComponent;
}

/** Compute volatility ratio between two markets (>= 1). */
export function computeVolRatio(ivA: number, ivB: number): number {
  if (isNaN(ivA) || isNaN(ivB)) return 1.0;
  const min = Math.min(ivA, ivB);
  if (min <= 1e-6) return 1.0;
  const max = Math.max(ivA, ivB);
  const ratio = max / min;
  return Number.isFinite(ratio) ? ratio : 1.0;
}

/**
 * Determine trade direction: buy the market with lower IV (undervolted/cheap),
 * sell (go no/bet against) the market with higher IV (overvolted/expensive).
 */
export function getVolArbDirection(ivPoly: number, ivKalshi: number): 'yes' | 'no' | null {
  if (ivPoly < ivKalshi) return 'yes'; // Polymarket undervalued -> buy YES
  if (ivPoly > ivKalshi) return 'no';  // Polymarket overvalued -> buy NO
  return null;
}
