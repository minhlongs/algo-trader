/**
 * Hyperliquid WebSocket L2 Book & Trades Stream Connector
 * In-memory L2 book management with monotonic timestamp validation and trade normalization.
 */

import { logger } from '../../../shared/utils/logger';
import {
  type BookLevel,
  type NormalizedOrderBook,
  type HyperliquidL2Level,
  type HyperliquidL2BookData,
  type HyperliquidL2BookMsg,
  type HyperliquidTradeData,
  type HyperliquidTradesMsg,
  type NormalizedTrade,
  parseHyperliquidL2Levels,
  parseHyperliquidTrades,
} from './hyperliquid-ws-parser';

export {
  type BookLevel,
  type NormalizedOrderBook,
  type HyperliquidL2Level,
  type HyperliquidL2BookData,
  type HyperliquidL2BookMsg,
  type HyperliquidTradeData,
  type HyperliquidTradesMsg,
  type NormalizedTrade,
  parseHyperliquidL2Levels,
  parseHyperliquidTrades,
};

export class HyperliquidWsConnector {
  private readonly coin: string;
  private bids: BookLevel[] = [];
  private asks: BookLevel[] = [];
  private lastTime = 0;
  private isSynchronized = false;

  constructor(coin: string) {
    this.coin = coin.toUpperCase();
  }

  getCoin(): string { return this.coin; }
  isSynced(): boolean { return this.isSynchronized; }
  getLastTime(): number { return this.lastTime; }

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
    if (data.coin.toUpperCase() !== this.coin) return null;

    if (data.time < this.lastTime) {
      logger.warn(`[HyperliquidWS] Out-of-order timestamp for ${this.coin}: current ${this.lastTime}, received ${data.time}`);
      return null;
    }

    this.lastTime = data.time;
    const [rawBids, rawAsks] = data.levels;
    const parsed = parseHyperliquidL2Levels(rawBids, rawAsks);
    this.bids = parsed.bids;
    this.asks = parsed.asks;

    this.isSynchronized = true;
    return this.getOrderBook();
  }

  parseTrades(payload: HyperliquidTradesMsg | HyperliquidTradeData[]): NormalizedTrade[] {
    return parseHyperliquidTrades(payload, this.coin);
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
