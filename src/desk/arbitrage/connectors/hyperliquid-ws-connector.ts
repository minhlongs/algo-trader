/**
 * Hyperliquid WebSocket L2 Book & Trades Stream Connector
 * In-memory L2 book management with monotonic timestamp validation and trade normalization.
 */

import { logger } from '../../../shared/utils/logger';

export interface BookLevel {
  price: number;
  amount: number;
}

export interface NormalizedOrderBook {
  venue: 'hyperliquid';
  symbol: string;
  timestamp: number;
  seq: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface HyperliquidL2Level {
  px: string;
  sz: string;
  n: number;
}

export interface HyperliquidL2BookData {
  coin: string;
  levels: [HyperliquidL2Level[], HyperliquidL2Level[]];
  time: number;
}

export interface HyperliquidL2BookMsg {
  channel: 'l2Book';
  data: HyperliquidL2BookData;
}

export interface HyperliquidTradeData {
  coin: string;
  side: 'B' | 'A' | 'buy' | 'sell';
  px: string;
  sz: string;
  time: number;
  hash?: string;
  tid?: number;
}

export interface HyperliquidTradesMsg {
  channel: 'trades';
  data: HyperliquidTradeData[];
}

export interface NormalizedTrade {
  venue: 'hyperliquid';
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  tradeId: string;
}

export class HyperliquidWsConnector {
  private readonly coin: string;
  private bids: BookLevel[] = [];
  private asks: BookLevel[] = [];
  private lastTime = 0;
  private isSynchronized = false;

  constructor(coin: string) {
    this.coin = coin.toUpperCase();
  }

  getCoin(): string {
    return this.coin;
  }

  isSynced(): boolean {
    return this.isSynchronized;
  }

  getLastTime(): number {
    return this.lastTime;
  }

  static buildSubscription(type: 'l2Book' | 'trades', coin: string): {
    method: 'subscribe';
    subscription: { type: 'l2Book' | 'trades'; coin: string };
  } {
    return {
      method: 'subscribe',
      subscription: { type, coin: coin.toUpperCase() },
    };
  }

  processL2Book(payload: HyperliquidL2BookMsg | HyperliquidL2BookData): NormalizedOrderBook | null {
    const data = 'channel' in payload ? payload.data : payload;

    if (data.coin.toUpperCase() !== this.coin) {
      return null;
    }

    if (data.time < this.lastTime) {
      logger.warn(`[HyperliquidWS] Out-of-order timestamp for ${this.coin}: current ${this.lastTime}, received ${data.time}`);
      return null;
    }

    this.lastTime = data.time;
    const [rawBids, rawAsks] = data.levels;

    this.bids = rawBids
      .map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }))
      .filter((l) => l.amount > 0)
      .sort((a, b) => b.price - a.price);

    this.asks = rawAsks
      .map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }))
      .filter((l) => l.amount > 0)
      .sort((a, b) => a.price - b.price);

    this.isSynchronized = true;

    return this.getOrderBook();
  }

  parseTrades(payload: HyperliquidTradesMsg | HyperliquidTradeData[]): NormalizedTrade[] {
    const trades = Array.isArray(payload) ? payload : payload.data;

    return trades
      .filter((t) => t.coin.toUpperCase() === this.coin)
      .map((t) => ({
        venue: 'hyperliquid',
        symbol: t.coin.toUpperCase(),
        side: (t.side === 'B' || t.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
        price: parseFloat(t.px),
        amount: parseFloat(t.sz),
        timestamp: t.time,
        tradeId: t.hash ?? (t.tid !== undefined ? String(t.tid) : `${t.coin}-${t.time}-${t.px}-${t.sz}`),
      }));
  }

  getOrderBook(depth = 20): NormalizedOrderBook {
    return {
      venue: 'hyperliquid',
      symbol: this.coin,
      timestamp: this.lastTime || Date.now(),
      seq: this.lastTime,
      bids: this.bids.slice(0, depth),
      asks: this.asks.slice(0, depth),
    };
  }

  getBestBidAsk(): { bestBid: number; bestBidQty: number; bestAsk: number; bestAskQty: number } | null {
    if (this.bids.length === 0 || this.asks.length === 0) return null;
    return {
      bestBid: this.bids[0].price,
      bestBidQty: this.bids[0].amount,
      bestAsk: this.asks[0].price,
      bestAskQty: this.asks[0].amount,
    };
  }

  reset(): void {
    this.bids = [];
    this.asks = [];
    this.lastTime = 0;
    this.isSynchronized = false;
  }
}
