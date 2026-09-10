/**
 * Regime-Adaptive Momentum Mathematical & Indicator Helpers
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import { calcSMA, calcATR } from './strategy-math-helpers';
import type { Regime } from './regime-adaptive-momentum-types';

export function detectRegime(
  shortPrices: number[],
  longPrices: number[],
  trendThreshold = 1.5,
  volatileAtrRatio = 2.0,
): Regime {
  if (shortPrices.length < 2 || longPrices.length < 2) return 'ranging';
  const smaShort = calcSMA(shortPrices);
  const smaLong = calcSMA(longPrices);
  const atrLong = calcATR(longPrices);
  const atrShort = calcATR(shortPrices);
  if (atrLong <= 0) return 'ranging';
  const trendStrength = Math.abs(smaShort - smaLong) / atrLong;
  if (trendStrength > trendThreshold) return 'trending';
  if (atrShort / atrLong > volatileAtrRatio) return 'volatile';
  return 'ranging';
}

export function calcPullbackDepth(prices: number[], current: number): number {
  if (prices.length === 0) return 0.5;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 0.5;
  return (current - min) / (max - min);
}

export function calcOBI(book: RawOrderBook): number {
  let bidVol = 0, askVol = 0;
  for (const b of book.bids) bidVol += parseFloat(b.size);
  for (const a of book.asks) askVol += parseFloat(a.size);
  if (askVol <= 0 || bidVol <= 0) return 1.0;
  return bidVol / askVol;
}

export function calcTrendDirection(shortSMA: number, longSMA: number): 'up' | 'down' {
  return shortSMA >= longSMA ? 'up' : 'down';
}

export function getRegimeTpPct(regime: Regime, cfg: {
  trendingTpPct: number;
  volatileTpPct: number;
  rangingTpPct: number;
}): number {
  if (regime === 'trending') return cfg.trendingTpPct;
  if (regime === 'volatile') return cfg.volatileTpPct;
  return cfg.rangingTpPct;
}

export function getRegimeSizeMultiplier(regime: Regime): number {
  if (regime === 'trending') return 1.2;
  if (regime === 'volatile') return 0.5;
  return 0.9;
}

export class RegimePriceTracker {
  private readonly history = new Map<string, number[]>();

  recordTick(tokenId: string, price: number, max: number): void {
    let list = this.history.get(tokenId);
    if (!list) {
      list = [];
      this.history.set(tokenId, list);
    }
    list.push(price);
    if (list.length > max) list.splice(0, list.length - max);
  }

  getPrices(tokenId: string, count: number): number[] {
    return (this.history.get(tokenId) ?? []).slice(-count);
  }

  get size(): number {
    return this.history.size;
  }
}
