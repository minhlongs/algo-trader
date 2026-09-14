/**
 * Baseline Trade Helpers
 *
 * Mathematical and trade execution helper utilities for baseline strategies.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type { BaselineCostConfig } from './baseline-types';

/** Seeded PRNG (mulberry32) for reproducibility. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundTripCost(price: number, cost: BaselineCostConfig): number {
  const multiplier = (cost.feeBps + cost.slippageBps) / 10000;
  return price * multiplier * 2;
}

export function makeTrade(
  timestamp: string,
  entryPrice: number,
  exitPrice: number,
  cost: BaselineCostConfig,
  size = 1,
): BacktestTrade {
  // PnL is a RETURN ON CAPITAL (fraction of entry price), so it compounds
  // correctly in buildEquityCurve and is comparable across price levels.
  const gross = (exitPrice - entryPrice) / entryPrice;
  const fee = roundTripCost(entryPrice, cost) / entryPrice;
  return {
    timestamp,
    tokenId: '',
    side: 'BUY',
    price: exitPrice,
    size,
    pnl: gross - fee,
  };
}
