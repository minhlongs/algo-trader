/**
 * Order Book Normalizer for MARL Market-Making.
 * Converts disparate Polymarket CLOB and CEX orderbook formats into canonical MarlOrderBook
 * and computes microstructural features including the 24-D observation vector.
 */

import type { MarlOrderBook, MarlOrderBookLevel, AgentObservation } from '../types/marl-types';

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

export class OrderBookNormalizer {
  public static normalizeLevel(rawPrice: string | number, rawSize: string | number): MarlOrderBookLevel | null {
    const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
    const size = typeof rawSize === 'string' ? parseFloat(rawSize) : rawSize;
    if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return null;
    return { price: Number(price.toFixed(4)), size: Number(size.toFixed(4)) };
  }

  public static normalizeCex(raw: RawCexOrderBook, venue = 'cex'): MarlOrderBook {
    const bids: MarlOrderBookLevel[] = [];
    const asks: MarlOrderBookLevel[] = [];

    for (const [p, s] of raw.bids ?? []) {
      const lvl = this.normalizeLevel(p, s);
      if (lvl) bids.push(lvl);
    }
    for (const [p, s] of raw.asks ?? []) {
      const lvl = this.normalizeLevel(p, s);
      if (lvl) asks.push(lvl);
    }

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

  public static normalizeClob(raw: RawClobOrderBook, venue = 'polymarket'): MarlOrderBook {
    const bids: MarlOrderBookLevel[] = [];
    const asks: MarlOrderBookLevel[] = [];

    for (const item of raw.bids ?? []) {
      if (!item) continue;
      const lvl = this.normalizeLevel(item.price, item.size);
      if (lvl) bids.push(lvl);
    }
    for (const item of raw.asks ?? []) {
      if (!item) continue;
      const lvl = this.normalizeLevel(item.price, item.size);
      if (lvl) asks.push(lvl);
    }

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

  public static computeMicrostructure(book: MarlOrderBook, depthLevels = 5): {
    midPrice: number;
    bestBid: number;
    bestAsk: number;
    spread: number;
    microPrice: number;
    l1Imbalance: number;
    depthImbalance: number;
  } {
    const bestBid = book.bids[0]?.price ?? 0.50;
    const bestAsk = book.asks[0]?.price ?? 0.50;
    const bidL1Vol = book.bids[0]?.size ?? 1;
    const askL1Vol = book.asks[0]?.size ?? 1;

    const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(4));
    const spread = Number((bestAsk - bestBid).toFixed(4));
    const totL1Vol = bidL1Vol + askL1Vol;

    const microPrice = totL1Vol > 0
      ? Number(((bestAsk * bidL1Vol + bestBid * askL1Vol) / totL1Vol).toFixed(4))
      : midPrice;

    const l1Imbalance = totL1Vol > 0
      ? Number(((bidL1Vol - askL1Vol) / totL1Vol).toFixed(4))
      : 0;

    let sumBidDepth = 0;
    let sumAskDepth = 0;
    for (let i = 0; i < depthLevels; i++) {
      sumBidDepth += book.bids[i]?.size ?? 0;
      sumAskDepth += book.asks[i]?.size ?? 0;
    }
    const totDepth = sumBidDepth + sumAskDepth;
    const depthImbalance =
      totDepth > 0 ? Number(((sumBidDepth - sumAskDepth) / totDepth).toFixed(4)) : 0;

    return { midPrice, bestBid, bestAsk, spread, microPrice, l1Imbalance, depthImbalance };
  }

  public static toObservation(
    book: MarlOrderBook,
    inventory = 0,
    timeToHorizonSec = 86400,
    volatility = 0.02,
    netDelta = 0,
  ): AgentObservation {
    const micro = this.computeMicrostructure(book);
    const obsVec = new Float64Array(24);
    obsVec[0] = Math.max(-1, Math.min(1, inventory / 10000));
    obsVec[1] = Math.max(0, Math.min(1, timeToHorizonSec / 86400));
    obsVec[2] = Math.max(0, Math.min(1, volatility / 0.1));
    obsVec[3] = micro.l1Imbalance;
    obsVec[4] = micro.depthImbalance;
    obsVec[5] = Math.max(-1, Math.min(1, (micro.microPrice - micro.midPrice) / 0.01));
    obsVec[6] = Math.max(0, Math.min(1, micro.spread / 0.10));
    obsVec[21] = Math.max(-1, Math.min(1, netDelta / 10000));

    return {
      symbol: book.symbol,
      venue: book.venue,
      midPrice: micro.midPrice,
      bestBid: micro.bestBid,
      bestAsk: micro.bestAsk,
      spread: micro.spread,
      orderBookImbalance: micro.l1Imbalance,
      depthImbalance: micro.depthImbalance,
      inventory,
      timeToHorizonSec,
      volatility,
      netDelta,
      observationVector: obsVec,
      timestamp: book.timestamp,
    };
  }
}
