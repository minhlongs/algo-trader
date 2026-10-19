/**
 * Binance WebSocket Orderbook & Trade Stream Connector
 * Real-time depth diff stream parser with strict continuous sequence validation.
 */

import { logger } from '../../../shared/utils/logger';
import {
  applyPriceLevelEntries,
  normalizeBinanceTrade,
  buildSortedOrderBook,
} from './binance-ws-helpers';

export { applyPriceLevelEntries, normalizeBinanceTrade, buildSortedOrderBook };

export interface BookLevel {
  price: number;
  amount: number;
}

export interface NormalizedOrderBook {
  venue: 'binance';
  symbol: string;
  timestamp: number;
  seq: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface BinanceDepthUpdate {
  e: string;
  E: number;
  s: string;
  U: number;
  u: number;
  pu: number;
  b: [string, string][];
  a: [string, string][];
}

export interface BinanceTradeMsg {
  e: string;
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  b: number;
  a: number;
  T: number;
  m: boolean;
}

export interface BinanceDepthSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export interface NormalizedTrade {
  venue: 'binance';
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  tradeId: string;
}

export class BinanceWsConnector {
  private readonly symbol: string;
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private lastUpdateId = -1;
  private isSynchronized = false;
  private buffer: BinanceDepthUpdate[] = [];

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase();
  }

  getSymbol(): string { return this.symbol; }
  isSynced(): boolean { return this.isSynchronized; }
  getLastUpdateId(): number { return this.lastUpdateId; }

  applySnapshot(snapshot: BinanceDepthSnapshot): void {
    this.bids.clear();
    this.asks.clear();
    applyPriceLevelEntries(this.bids, snapshot.bids, false);
    applyPriceLevelEntries(this.asks, snapshot.asks, false);
    this.lastUpdateId = snapshot.lastUpdateId;
    this.isSynchronized = true;

    const pending = [...this.buffer];
    this.buffer = [];
    for (const update of pending) {
      if (update.u <= this.lastUpdateId) continue;
      if (update.U <= this.lastUpdateId + 1 && update.u >= this.lastUpdateId + 1) {
        this.applyDepthDelta(update);
        this.lastUpdateId = update.u;
      } else if (this.isSynchronized) {
        this.processDepthUpdate(update);
      }
    }
  }

  processDepthUpdate(update: BinanceDepthUpdate): boolean {
    if (!this.isSynchronized) {
      this.buffer.push(update);
      return false;
    }
    if (update.pu !== undefined && update.pu !== this.lastUpdateId) {
      logger.warn(`[BinanceWS] Sequence gap detected for ${this.symbol}: expected ${this.lastUpdateId}, got ${update.pu}`);
      this.isSynchronized = false;
      this.buffer = [];
      return false;
    }
    this.applyDepthDelta(update);
    this.lastUpdateId = update.u;
    return true;
  }

  private applyDepthDelta(update: BinanceDepthUpdate): void {
    applyPriceLevelEntries(this.bids, update.b, true);
    applyPriceLevelEntries(this.asks, update.a, true);
  }

  parseTrade(msg: BinanceTradeMsg): NormalizedTrade {
    return normalizeBinanceTrade(msg);
  }

  getOrderBook(depth = 20): NormalizedOrderBook {
    return buildSortedOrderBook(this.symbol, this.lastUpdateId, this.bids, this.asks, depth);
  }

  getBestBidAsk(): { bestBid: number; bestBidQty: number; bestAsk: number; bestAskQty: number } | null {
    const book = this.getOrderBook(1);
    if (book.bids.length === 0 || book.asks.length === 0) return null;
    return {
      bestBid: book.bids[0].price,
      bestBidQty: book.bids[0].amount,
      bestAsk: book.asks[0].price,
      bestAskQty: book.asks[0].amount,
    };
  }

  reset(): void {
    this.bids.clear();
    this.asks.clear();
    this.lastUpdateId = -1;
    this.isSynchronized = false;
    this.buffer = [];
  }
}
