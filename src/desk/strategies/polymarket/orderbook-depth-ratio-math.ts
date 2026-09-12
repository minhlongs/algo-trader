/**
 * Orderbook Depth Ratio Quantitative Math Helpers
 */

import type { RawOrderBook, OrderBookLevel } from '../../polymarket/clob-client';

export function calcDepthRatio(book: RawOrderBook, levels: number): number {
  const sumVolume = (lvls: OrderBookLevel[], n: number): number => {
    let total = 0;
    const limit = Math.min(n, lvls.length);
    for (let i = 0; i < limit; i++) total += parseFloat(lvls[i].size);
    return total;
  };
  const bidVol = sumVolume(book.bids, levels);
  const askVol = sumVolume(book.asks, levels);
  if (bidVol === 0 && askVol === 0) return 0;
  if (askVol === 0) return Infinity;
  return bidVol / askVol;
}

export function calcDepthZScore(ratios: number[]): number {
  if (ratios.length < 3) return 0;
  const n = ratios.length;
  const mean = ratios.reduce((s, r) => s + r, 0) / n;
  const variance = ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (ratios[n - 1] - mean) / std;
}

export function detectMomentum(prices: number[]): 'up' | 'down' | 'flat' {
  if (prices.length < 3) return 'flat';
  const last3 = prices.slice(-3);
  if (last3[2] > last3[1] && last3[1] > last3[0]) return 'up';
  if (last3[2] < last3[1] && last3[1] < last3[0]) return 'down';
  return 'flat';
}
