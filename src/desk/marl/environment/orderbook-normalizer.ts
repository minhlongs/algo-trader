/**
 * Order Book Normalizer for MARL Market-Making.
 * Converts disparate Polymarket CLOB and CEX orderbook formats into canonical MarlOrderBook
 * and computes microstructural features including the 24-D observation vector.
 *
 * Static facade over the split normalizer (raw → canonical book) and the
 * microstructure/observation computation; both halves are individually testable.
 */

import type { MarlOrderBook, MarlOrderBookLevel, AgentObservation } from '../types/marl-types';
import {
  normalizeCex,
  normalizeClob,
  normalizeLevel,
  type RawCexOrderBook,
  type RawClobOrderBook,
} from './orderbook-level-normalizer';

export type { RawCexOrderBook, RawClobOrderBook };

/** Mid/imbalance features derived from a canonical book at a given depth. */
export interface Microstructure {
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  microPrice: number;
  l1Imbalance: number;
  depthImbalance: number;
}

/** Fallback best bid/ask for an empty book side. */
const FLAT_BOOK_PRICE = 0.50;

/** Fallback L1 volume for an empty book side. */
const FLAT_BOOK_SIZE = 1;

/** Decimal places kept on derived microstructure values. */
const MICRO_DECIMALS = 4;

export class OrderBookNormalizer {
  public static normalizeLevel(rawPrice: string | number, rawSize: string | number): MarlOrderBookLevel | null {
    return normalizeLevel(rawPrice, rawSize);
  }

  public static normalizeCex(raw: RawCexOrderBook, venue = 'cex'): MarlOrderBook {
    return normalizeCex(raw, venue);
  }

  public static normalizeClob(raw: RawClobOrderBook, venue = 'polymarket'): MarlOrderBook {
    return normalizeClob(raw, venue);
  }

  public static computeMicrostructure(book: MarlOrderBook, depthLevels = 5): Microstructure {
    const bestBid = book.bids[0]?.price ?? FLAT_BOOK_PRICE;
    const bestAsk = book.asks[0]?.price ?? FLAT_BOOK_PRICE;
    const bidL1Vol = book.bids[0]?.size ?? FLAT_BOOK_SIZE;
    const askL1Vol = book.asks[0]?.size ?? FLAT_BOOK_SIZE;

    const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(MICRO_DECIMALS));
    const spread = Number((bestAsk - bestBid).toFixed(MICRO_DECIMALS));
    const totL1Vol = bidL1Vol + askL1Vol;

    const microPrice = totL1Vol > 0
      ? Number(((bestAsk * bidL1Vol + bestBid * askL1Vol) / totL1Vol).toFixed(MICRO_DECIMALS))
      : midPrice;

    const l1Imbalance = totL1Vol > 0
      ? Number(((bidL1Vol - askL1Vol) / totL1Vol).toFixed(MICRO_DECIMALS))
      : 0;

    let sumBidDepth = 0;
    let sumAskDepth = 0;
    for (let i = 0; i < depthLevels; i++) {
      sumBidDepth += book.bids[i]?.size ?? 0;
      sumAskDepth += book.asks[i]?.size ?? 0;
    }
    const totDepth = sumBidDepth + sumAskDepth;
    const depthImbalance =
      totDepth > 0 ? Number(((sumBidDepth - sumAskDepth) / totDepth).toFixed(MICRO_DECIMALS)) : 0;

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
