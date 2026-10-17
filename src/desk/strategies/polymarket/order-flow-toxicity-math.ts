/**
 * Pure Mathematical Helpers for Order Flow Toxicity (VPIN & Imbalance Z-Score)
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import { calcStdDev } from './strategy-math-helpers';

/**
 * Estimate buy/sell volume imbalance from two order book snapshots.
 * Positive = net buy pressure, negative = net sell pressure.
 */
export function estimateTradeImbalance(prev: RawOrderBook, curr: RawOrderBook): number {
  const prevBidVol = prev.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const prevAskVol = prev.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const currBidVol = curr.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const currAskVol = curr.asks.reduce((s, l) => s + parseFloat(l.size), 0);

  const bidDelta = prevBidVol - currBidVol;
  const askDelta = prevAskVol - currAskVol;

  const total = Math.abs(bidDelta) + Math.abs(askDelta);
  if (total <= 0) return 0;
  return (bidDelta - askDelta) / total;
}

/**
 * Compute VPIN: fraction of imbalance buckets classified as buy-initiated.
 */
export function calcVPIN(imbalances: number[]): number {
  if (imbalances.length === 0) return 0.5;
  const buyBuckets = imbalances.filter(imb => imb > 0).length;
  return buyBuckets / imbalances.length;
}

/**
 * Compute toxicity Z-score: how many std devs VPIN is from its mean.
 */
export function calcToxicityZScore(vpin: number, history: number[]): number {
  const mean = history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0.5;
  const std = history.length > 1 ? calcStdDev(history) : 0.1;
  if (std <= 0) return 0;
  return Math.abs(vpin - mean) / std;
}
