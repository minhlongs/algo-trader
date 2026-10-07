/**
 * Binance WebSocket Orderbook & Trade Stream Connector
 * Real-time depth diff stream parser with strict continuous sequence validation.
 */

import { logger } from '../../../shared/utils/logger';

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
    for (const [p, q] of snapshot.bids) {
      const price = parseFloat(p), qty = parseFloat(q);
      if (qty > 0) this.bids.set(price, qty);
    }
    for (const [p, q] of snapshot.asks) {
      const price = parseFloat(p), qty = parseFloat(q);
      if (qty > 0) this.asks.set(price, qty);
    }
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
    for (const [p, q] of update.b) {
      const price = parseFloat(p), qty = parseFloat(q);
      if (qty === 0) this.bids.delete(price);
      else this.bids.set(price, qty);
    }
    for (const [p, q] of update.a) {
      const price = parseFloat(p), qty = parseFloat(q);
      if (qty === 0) this.asks.delete(price);
      else this.asks.set(price, qty);
    }
  }

  parseTrade(msg: BinanceTradeMsg): NormalizedTrade {
    return {
      venue: 'binance',
      symbol: msg.s,
      side: msg.m ? 'sell' : 'buy',
      price: parseFloat(msg.p),
      amount: parseFloat(msg.q),
      timestamp: msg.T,
      tradeId: String(msg.t),
    };
  }

  getOrderBook(depth = 20): NormalizedOrderBook {
    const sortedBids = Array.from(this.bids.entries())
      .map(([price, amount]) => ({ price, amount }))
      .sort((a, b) => b.price - a.price)
      .slice(0, depth);
    const sortedAsks = Array.from(this.asks.entries())
      .map(([price, amount]) => ({ price, amount }))
      .sort((a, b) => a.price - b.price)
      .slice(0, depth);
    return {
      venue: 'binance',
      symbol: this.symbol,
      timestamp: Date.now(),
      seq: this.lastUpdateId,
      bids: sortedBids,
      asks: sortedAsks,
    };
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
